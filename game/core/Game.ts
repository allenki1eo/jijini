/**
 * The game orchestrator: owns every simulation system and ticks them from a
 * single frame callback. React renders meshes and HUD from its state but
 * never drives the simulation.
 */
import * as THREE from "three";
import type { CityId } from "@/data/cities/config";
import { currentRideStats, usePlayer } from "@/stores/player";
import { useSettings } from "@/stores/settings";
import { BikeModel } from "@/game/vehicles/BikeModel";
import { BikePhysics } from "@/game/vehicles/BikePhysics";
import type { RideStats } from "@/game/vehicles/bikes";
import { ChaseCamera } from "@/game/vehicles/ChaseCamera";
import { GhostRider } from "@/game/vehicles/GhostRider";
import { streamFocus } from "@/game/world/focus";
import type { CityManifest } from "@/game/world/format";
import { WorldIndex } from "@/game/world/WorldIndex";
import { clockText, env, setRealTime, updateEnvironment } from "@/game/systems/environment";
import { Checkpoints } from "@/game/traffic/Checkpoints";
import { loadNavNetwork, type NavNetwork } from "@/game/traffic/NavNetwork";
import { Pedestrians } from "@/game/traffic/Pedestrians";
import { TrafficSystem, type Obstacle } from "@/game/traffic/TrafficSystem";
import { POI_KINDS, ROAD_CLASSES, ROAD_SPEED, type FrontageFile, type Poi } from "@/game/world/format";
import { RainField } from "@/game/world/RainField";
import { PlaceSigns, synthesizeBusStops } from "@/game/world/PlaceSigns";
import { buildHeroBillboard, loadAds } from "@/game/world/adAtlas";
import { RoadBanners } from "@/game/world/RoadBanners";
import { Markets } from "@/game/world/Markets";
import { Radio, radioHud } from "@/game/audio/Radio";
import { liveStations, livePlayer, loadLiveStations } from "@/game/audio/LiveRadio";
import { fetchJson } from "@/lib/fetchJson";
import { Collectibles, HELMET_REWARD } from "@/game/world/Collectibles";
import { Particles } from "@/game/world/Particles";
import { buildLandmark } from "@/game/world/landmarks";
import { FuelStations } from "@/game/world/FuelStations";
import { KijiweStage, stageHud } from "@/game/world/KijiweStage";
import { StreetEvents } from "@/game/world/StreetEvents";
import { FLEET_BIKES } from "@/data/fleet";
import { submitDelivery, submitRaceTime } from "@/lib/leaderboard";
import { FuelSellers } from "@/game/world/FuelSellers";
import { Frontage } from "@/game/world/Frontage";
import { Civic } from "@/game/world/Civic";
import { BankBranches } from "@/game/world/BankBranches";
import { CASH_RISK_LEVEL, isWakala, type BankId } from "@/data/banks";
import { attachTelemetry } from "@/lib/telemetry";
import { accrueInterest } from "@/game/systems/money";
import { makeProjector } from "@/game/world/projection";
import { MissionGenerator } from "@/game/missions/generator";
import { MissionRunner, missionHud, type TalkOption } from "@/game/missions/MissionRunner";
import { PhoneSystem } from "@/game/phone/PhoneSystem";
import { RouteGuide } from "@/game/missions/RouteGuide";
import { unlockedTypes, type MissionDef, type MissionType } from "@/game/missions/types";
import { CITIES } from "@/data/cities/config";
import { BODA_OWNER, FUEL_PRICE, HESABU, HESABU_HOUR, LICENCE_FEE, LICENCE_HOURS, PERMIT_FEE, PERMIT_HOURS, REPAIR_RATE } from "@/data/prices";
import { Police, policeHud } from "@/game/traffic/Police";
import { TrafficLights } from "@/game/traffic/TrafficLights";
import { usePhone } from "@/stores/phone";
import { useMissions } from "@/stores/missions";
import { attachProgression, dayKey, weekKey } from "@/game/systems/progression";
import { audio } from "@/game/audio/AudioEngine";
import { attachVoices } from "@/game/audio/voices";
import { say } from "@/game/systems/speech";
import { currentDictionary, fmt, formatTzs } from "@/i18n";
import type { Quality } from "@/stores/settings";
import { attachInputs, clearPressed, controls, pollControls } from "./controls";
import { events } from "./events";
import { hud, navHud } from "./hud";

const SAVE_RIDE_EVERY = 3;
const DENSITY: Record<Quality, { traffic: number; peds: number; rain: number }> = {
  low: { traffic: 12, peds: 16, rain: 500 },
  medium: { traffic: 22, peds: 30, rain: 900 },
  high: { traffic: 34, peds: 48, rain: 1500 },
};
const MAX_DT = 1 / 20;

/** Room the shop rows leave around big landmarks (m); anything unlisted gets 12. */
const LANDMARK_CLEARANCE: Record<string, number> = {
  "kambarage-stadium": 64,
  "jamhuri-stadium": 64,
  "mkwakwani-stadium": 64,
  "sokoine-stadium": 64,
  "kariakoo-market": 26,
  "nyerere-statue": 14,
  "uhuru-torch": 12,
  "bismarck-rock": 10,
};

/** How many junctions get traffic lights in each city. */
/** Chevrons to a place the rider picked on the map, and to a sheli. */
const TRIP_COLOR = "#38BDF8";
const FUEL_COLOR = "#FF5A4F";
const LIGHTS: Record<CityId, number> = { kariakoo: 14, dodoma: 8, arusha: 8, mwanza: 8, mbeya: 6, tanga: 5, moshi: 5, shinyanga: 3 };

export class Game {
  readonly index = new WorldIndex();
  readonly bike = new BikePhysics();
  readonly model = new BikeModel();
  readonly chase = new ChaseCamera();
  /** Everything the game owns in the scene. */
  readonly root = new THREE.Group();
  nav: NavNetwork | null = null;
  pois: Poi[] = [];
  traffic: TrafficSystem | null = null;
  peds: Pedestrians | null = null;
  checkpoints: Checkpoints | null = null;
  police: Police | null = null;
  lights: TrafficLights | null = null;
  /** Junction node last run on red (one ticket per crossing). */
  private redRunAt = -1;
  missions: MissionRunner | null = null;
  phone: PhoneSystem | null = null;
  private generator: MissionGenerator | null = null;
  private guide = new RouteGuide();
  private collectibles: Collectibles | null = null;
  /** Signposts, shelters and labels for real places. */
  places: PlaceSigns | null = null;
  private banners: RoadBanners | null = null;
  private markets: Markets | null = null;
  private fuelStations: FuelStations | null = null;
  private frontage: Frontage | null = null;
  private civic: Civic | null = null;
  private banks: BankBranches | null = null;
  private radio: Radio | null = null;
  private disposeAds: (() => void) | null = null;
  private landmarkObjects: THREE.Object3D[] = [];
  /** Petrol stations and fundi (mechanics), for refuelling and repairs. */
  private services: { x: number; z: number; fuel: boolean; police?: boolean; bank?: BankId; wakala?: boolean; bottle?: boolean; name: string }[] = [];
  private fuelSellers: FuelSellers | null = null;
  private stage: KijiweStage | null = null;
  private streetEvents: StreetEvents | null = null;
  /** The city's landmarks: photo spots (and tourist stops). */
  private sights: { x: number; z: number; name: string }[] = [];
  /** Gulio: the weekly market day (busier streets, better-paid market jobs). */
  private marketDay = false;
  /** The pothole toast shows once per ride. */
  private potholeWarned = false;
  private rain: RainField;
  private headlight = new THREE.SpotLight("#FFF1D0", 0, 48, 0.55, 0.65, 1.1);
  private obstacles: Obstacle[] = [];
  private particles = new Particles();
  private ghost = new GhostRider();
  private emitCarry = 0;
  private quality: Quality;
  stats: RideStats;
  paused = false;
  /** True while the player can ride (false in map/fly debug cameras). */
  riding = true;
  /** Fuel burn multiplier; the tutorial sets it to 0. */
  fuelUse = 1;
  wetness = 0;
  /** Called when the player presses Esc / P / Start. */
  onPauseRequest: (() => void) | null = null;
  private sinceSave = 0;
  private topSpeedSeen = 0;
  private disposed = false;
  private detach: (() => void) | null = null;
  private unsubPlayer: () => void;
  private offEvents: (() => void)[] = [];

  constructor(
    readonly cityId: CityId,
    readonly manifest: CityManifest,
    readonly baseUrl: string,
  ) {
    const p = usePlayer.getState();
    this.quality = useSettings.getState().quality;
    this.rain = new RainField(DENSITY.high.rain);
    this.root.add(this.model.root, this.rain.mesh, this.headlight, this.headlight.target, this.guide.group, this.tripGuide.group, this.particles.points, this.ghost.model.root);
    this.stats = currentRideStats(p);
    this.bike.place(manifest.spawn.x, manifest.spawn.z, manifest.spawn.heading);
    this.bike.state.fuel = Math.min(p.fuel, this.stats.tank);
    this.bike.state.damage = p.damage;
    this.model.setBike(p.equipped, p.custom);
    this.model.setHelmet(p.gear.helmet);
    // Garage changes made mid-session (or a fresh hydrate) apply immediately.
    this.unsubPlayer = usePlayer.subscribe((s, prev) => {
      if (s.equipped !== prev.equipped || s.upgrades !== prev.upgrades || s.custom !== prev.custom) {
        this.stats = currentRideStats(s);
        this.model.setBike(s.equipped, s.custom);
      }
      if (s.gear.helmet !== prev.gear.helmet) this.model.setHelmet(s.gear.helmet);
      if (s.hydrated && !prev.hydrated) {
        this.bike.state.fuel = Math.min(s.fuel, this.stats.tank);
        this.bike.state.damage = s.damage;
      }
    });
    this.offEvents.push(
      events.on("horn", () => {
        const { x, z } = this.bike.state;
        this.traffic?.hornAt(x, z, this.stats.hornRange);
        this.peds?.hornAt(x, z, this.stats.hornRange);
      }),
      // The league (signed-in riders): weekly race times, and points and earnings for every job.
      events.on("raceFinished", ({ courseId, seconds }) => courseId.includes("-weekly-") && submitRaceTime(this.cityId, seconds)),
      events.on("delivery", ({ earned, stars, clean }) => submitDelivery(this.cityId, { earned, stars, clean })),
      events.on("pothole", ({ speed }) => {
        this.chase.kick(Math.min(0.6, speed / 16));
        audio.crash(Math.min(0.4, speed / 25));
        if (!this.potholeWarned) {
          this.potholeWarned = true;
          events.emit("toast", { text: currentDictionary().events.pothole, tone: "coral" });
        }
      }),
      events.on("collision", ({ speed, kind }) => {
        this.chase.kick(Math.min(1, speed / 10));
        // A hard knock can crack the helmet: get a new one before the next roadblock.
        const player = usePlayer.getState();
        if (speed > 9 && player.gear.helmet && Math.random() < 0.35) {
          player.patch({ gear: { ...player.gear, helmet: false } });
          events.emit("toast", { text: currentDictionary().gear.cracked, tone: "coral" });
        }
        usePlayer.getState().adjustReputation(-(kind === "pedestrian" ? 0.15 : kind === "vehicle" ? 0.08 : 0.02) * Math.min(2, speed / 6));
      }),
    );
  }

  setPaused(paused: boolean) {
    this.paused = paused;
  }

  setPauseHandler(handler: (() => void) | null) {
    this.onPauseRequest = handler;
  }

  /** Attach input and load the traffic network and points of interest. */
  async start() {
    const detachInputs = attachInputs();
    const detachProgression = attachProgression();
    accrueInterest();
    // Anonymous counts for /stats: kilometres come off the bike's odometer since the last report.
    let reportedKm = 0;
    const detachTelemetry = attachTelemetry(this.cityId, () => {
      const total = this.bike.state.odometer / 1000 + this.telemetryKm;
      const km = Math.max(0, total - reportedKm);
      reportedKm = total;
      return km;
    });
    const detachAudio = this.attachAudio();
    this.detach = () => {
      detachInputs();
      detachProgression();
      detachAudio();
      detachTelemetry();
    };
    const [nav, mapped, frontage] = await Promise.all([
      loadNavNetwork(this.baseUrl),
      fetchJson<Poi[]>(`${this.baseUrl}/pois.json`).catch(() => [] as Poi[]),
      // Older bakes have no frontage file: the streets just stay as mapped.
      fetchJson<FrontageFile>(`${this.baseUrl}/frontage.json`).catch(() => null),
    ]);
    if (this.disposed) return;
    this.nav = nav;
    // Main roads without mapped daladala stops get them, so every city has places to wait for a ride.
    const pois = [...mapped, ...synthesizeBusStops(nav, mapped)];
    this.pois = pois;
    this.places = new PlaceSigns(pois);
    this.root.add(this.places.group);
    // Local businesses on billboards, road banners and the radio.
    this.disposeAds = loadAds(this.cityId);
    this.banners = new RoadBanners(nav);
    this.root.add(this.banners.group);
    // Street markets around the marketplaces, with solid stall fronts.
    this.markets = new Markets(nav, pois);
    this.root.add(this.markets.group);
    if (this.markets.walls.length) this.index.addChunk("markets", new Float32Array(this.markets.walls), new Float32Array());
    const busy = new Set([POI_KINDS.indexOf("market"), POI_KINDS.indexOf("bus_station")]);
    this.riskSpots = pois.filter((p) => busy.has(p.k)).map((p) => [p.x / 10, p.z / 10]);
    this.radio = new Radio(this.cityId, [...new Set(pois.filter((p) => busy.has(p.k) && p.n).map((p) => p.n!))]);
    const cap = DENSITY.high;
    this.traffic = new TrafficSystem(nav, cap.traffic);
    this.peds = new Pedestrians(nav, cap.peds);
    const market = POI_KINDS.indexOf("market");
    this.peds.setHotspots(pois.filter((poi) => poi.k === market).map((poi) => [poi.x / 10, poi.z / 10]));
    this.checkpoints = new Checkpoints(nav, this.manifest.spawn, this.cityId.length * 7919);
    // Gulio: Saturday is market day everywhere; Kariakoo's crowds are biggest at the weekend.
    const weekday = new Date().getDay();
    this.marketDay = weekday === 6 || (this.cityId === "kariakoo" && weekday === 0);
    if (this.marketDay) window.setTimeout(() => !this.disposed && events.emit("toast", { text: currentDictionary().events.marketDay, tone: "sun" }), 9000);
    this.applyDensity();
    // Dar has lights everywhere; Shinyanga only at a couple of big junctions.
    this.lights = new TrafficLights(nav, LIGHTS[this.cityId]);
    this.traffic.lights = this.lights;
    this.root.add(this.lights.group);
    this.police = new Police(nav, this.index, this.manifest.spawn, this.checkpoints.points, this.cityId.length * 104729);
    this.root.add(this.traffic.group, this.peds.group, this.checkpoints.group, this.police.group);
    const fuel = POI_KINDS.indexOf("fuel");
    const garage = POI_KINDS.indexOf("garage");
    this.services = pois
      .filter((poi) => poi.k === fuel || poi.k === garage)
      .map((poi) => ({ x: (poi.r?.[0] ?? poi.x) / 10, z: (poi.r?.[1] ?? poi.z) / 10, fuel: poi.k === fuel, name: poi.n ?? poi.b ?? "" }));
    // Forecourts at the petrol stations; you refuel stopped under the canopy.
    this.fuelStations = new FuelStations(nav, this.services.filter((p) => p.fuel), FUEL_PRICE[this.cityId], `TSh ${currentDictionary().station.perLitre}`);
    this.root.add(this.fuelStations.group);
    if (this.fuelStations.walls.length) this.index.addChunk("fuel-stations", new Float32Array(this.fuelStations.walls), new Float32Array());
    this.services = [...this.services.filter((p) => !p.fuel), ...this.fuelStations.stations.map((st) => ({ x: st.bayX, z: st.bayZ, fuel: true, name: st.name }))];
    // Cows, wedding convoys and storm potholes.
    this.streetEvents = new StreetEvents(nav);
    this.root.add(this.streetEvents.group);
    // Petrol in bottles on the side streets, far from any pump.
    this.fuelSellers = new FuelSellers(nav, this.fuelStations.stations.map((st) => ({ x: st.bayX, z: st.bayZ })), this.cityId.length * 4421 + 7);
    this.root.add(this.fuelSellers.group);
    for (const seller of this.fuelSellers.sellers) this.services.push({ x: seller.x, z: seller.z, fuel: false, bottle: true, name: currentDictionary().station.bottleSeller });
    // Licences are renewed with the police: stations, checkpoints and traffic officers.
    const policeKind = POI_KINDS.indexOf("police");
    for (const poi of pois.filter((p) => p.k === policeKind)) this.services.push({ x: (poi.r?.[0] ?? poi.x) / 10, z: (poi.r?.[1] ?? poi.z) / 10, fuel: false, police: true, name: poi.n ?? "" });
    for (const p of [...this.checkpoints.points, ...this.police.points]) this.services.push({ x: p.x, z: p.z, fuel: false, police: true, name: "" });
    // Landmarks: placed from lat/lon, solid to ride into, and tourist photo stops.
    const { project } = makeProjector(this.manifest.origin.lat, this.manifest.origin.lon);
    const sights = this.sights;
    const place = (id: string, x: number, z: number, yaw: number) => {
      const built = buildLandmark(id);
      if (!built) return;
      built.object.position.set(x, 0, z);
      built.object.rotation.y = yaw;
      this.root.add(built.object);
      this.landmarkObjects.push(built.object);
      if (!built.walls.length) return;
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      const walls = new Float32Array(built.walls.length);
      for (let i = 0; i < walls.length; i += 2) {
        const lx = built.walls[i]!, lz = built.walls[i + 1]!;
        walls[i] = x + lx * c + lz * sn;
        walls[i + 1] = z - lx * sn + lz * c;
      }
      this.index.addChunk(`landmark:${id}`, walls, new Float32Array());
    };
    /** Stand at the roadside nearest (x, z), with local −z facing the road. */
    const curb = (x: number, z: number, extra = 2.2) => {
      const n = nav.nearestOnNetwork(x, z);
      let dx = x - n.x, dz = z - n.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      const off = nav.lanes[n.lane]!.width / 2 + extra;
      return { x: n.x + dx * off, z: n.z + dz * off, yaw: Math.atan2(dx, dz) };
    };
    // Where the generated shop rows must leave room: landmarks, forecourts, the kijiwe and the hero billboard.
    const keepOut = this.fuelStations.stations.map((st) => ({ x: st.bayX, z: st.bayZ, r: 14 }));
    for (const lm of CITIES[this.cityId].landmarks) {
      const [px, pz] = project(lm.lat, lm.lon);
      const at = lm.placement === "curb" ? curb(px, pz) : { x: px, z: pz, yaw: ((lm.yaw ?? 0) * Math.PI) / 180 };
      place(lm.id, at.x, at.z, at.yaw);
      sights.push({ x: at.x, z: at.z, name: lm.name });
      keepOut.push({ x: at.x, z: at.z, r: LANDMARK_CLEARANCE[lm.id] ?? 12 });
    }
    // Every ride starts at Mzee Juma's kijiwe, on the left-hand verge just ahead of the spawn point.
    {
      const { x, z, heading } = this.manifest.spawn;
      const fx = -Math.sin(heading), fz = -Math.cos(heading);
      // Left of (fx, fz) is (fz, −fx).
      const at = curb(x + fx * 10 + fz * 6, z + fz * 10 - fx * 6, 3.2);
      place("kijiwe", at.x, at.z, at.yaw);
      keepOut.push({ x: at.x, z: at.z, r: 8 });
      // The boda stage beside it: queue for customers, or steal one and anger the riders.
      this.stage = new KijiweStage(at.x, at.z, at.yaw);
      this.root.add(this.stage.group);
      keepOut.push({ x: this.stage.spot.x, z: this.stage.spot.z, r: 9 });
      // The sponsor's hero billboard, across the road and further on, facing the rider at the start.
      const hero = buildHeroBillboard();
      const spot = curb(x + fx * 38 - fz * 6, z + fz * 38 + fx * 6, 4.5);
      hero.object.position.set(spot.x, 0, spot.z);
      hero.object.rotation.y = Math.atan2(-fx, -fz);
      this.root.add(hero.object);
      this.landmarkObjects.push(hero.object);
      keepOut.push({ x: spot.x, z: spot.z, r: 9 });
    }
    // Schools, churches and mosques, pitches and playgrounds.
    this.civic = new Civic(pois, nav);
    this.root.add(this.civic.group);
    if (this.civic.walls.length) this.index.addChunk("civic", new Float32Array(this.civic.walls), new Float32Array());
    keepOut.push(...this.civic.keepOut);
    // Bank branches with ATMs, and mapped mobile-money agents.
    this.banks = new BankBranches(pois, nav);
    this.root.add(this.banks.group);
    if (this.banks.walls.length) this.index.addChunk("banks", new Float32Array(this.banks.walls), new Float32Array());
    for (const b of this.banks.branches) {
      this.services.push({ x: b.x, z: b.z, fuel: false, bank: b.bank, name: b.name });
      keepOut.push({ x: b.x, z: b.z, r: 6 });
    }
    for (const poi of pois) if (isWakala(poi.n) && poi.r) this.services.push({ x: poi.r[0] / 10, z: poi.r[1] / 10, fuel: false, wakala: true, name: poi.n ?? "" });
    // Rows of dukas along streets the map left bare, so riding feels like a real town.
    if (frontage) {
      this.frontage = new Frontage(frontage, keepOut);
      this.root.add(this.frontage.group);
      if (this.frontage.walls.length) this.index.addChunk("frontage", new Float32Array(this.frontage.walls), new Float32Array());
      for (const w of this.frontage.wakala) this.services.push({ x: w.x, z: w.z, fuel: false, wakala: true, name: w.name });
    }
    this.collectibles = new Collectibles(nav, this.cityId, usePlayer.getState().collectibles, (id) => {
      const p = usePlayer.getState();
      p.patch({ collectibles: [...p.collectibles, id] });
      p.earn(HELMET_REWARD, 25);
    });
    this.root.add(this.collectibles.group);
    this.generator = new MissionGenerator(nav, pois, sights, this.cityId);
    this.missions = new MissionRunner(nav, this.model, this.guide, this.cityId, this.ghost, this.root);
    this.missions.setSights(sights);
    this.phone = new PhoneSystem({
      makeJob: (type: MissionType, client: string) => this.generator?.single(type, this.generatorContext(), client) ?? null,
      accept: (def) => this.acceptMission(def),
      unlocked: () => this.generatorContext().types,
      available: () => this.riding && !this.paused && this.fuelUse > 0 && usePlayer.getState().tutorialDone,
    });
    this.refreshOffers();
  }

  /** Generate a fresh mission board around the rider. */
  refreshOffers() {
    if (!this.generator || !this.nav) return;
    // Reputation (Sifa) shapes the board: trusted riders see more and better-paid jobs.
    const rep = usePlayer.getState().reputation;
    const offers = this.generator.offers(this.generatorContext(), rep < 2 ? 3 : rep >= 4 ? 5 : 4).map((o) => ({
      ...o,
      // Market day: shoppers pay a little more to get their goods home.
      fare: Math.round((o.fare * (0.85 + rep * 0.06) * (this.marketDay && (o.type === "soko" || o.type === "ninunulie" || o.type === "mzigo") ? 1.3 : 1)) / 100) * 100,
    }));
    useMissions.getState().set({ offers });
  }

  private generatorContext() {
    const p = usePlayer.getState();
    return {
      nav: this.nav!,
      pois: this.pois,
      x: this.bike.state.x,
      z: this.bike.state.z,
      types: unlockedTypes(p.level, p.storyChapter),
      hour: env.hour,
      night: env.night > 0.5,
      rain: env.rain > 0.4,
      difficulty: CITIES[this.cityId].difficulty,
    };
  }

  /** Tutorial: a guaranteed short first job, free fuel, fixed sunny afternoon. */
  startTutorialMission() {
    if (!this.generator || !this.nav) return false;
    this.missions?.start(this.generator.tutorial(this.generatorContext()), this.bike.state);
    return true;
  }

  setTutorial(on: boolean) {
    this.fuelUse = on ? 0 : 1;
    env.frozen = on;
    if (on) {
      env.hour = 16.5;
      env.weather = "sunny";
    }
  }

  acceptMission(def: MissionDef) {
    this.missions?.start(def, this.bike.state);
    useMissions.getState().set({ offers: useMissions.getState().offers.filter((o) => o.id !== def.id) });
  }

  /** A quick HUD toast. */
  toast(text: string, tone: "sun" | "forest" | "sky" | "coral" | "cream" = "cream") {
    events.emit("toast", { text, tone });
  }

  /** Start a side hustle (delivery shift, promo ride) from the phone. Returns false when busy or nothing fits here. */
  startHustle(type: "delivery" | "matangazo"): "started" | "busy" | "none" {
    if (this.missions?.active) return "busy";
    const def = this.generator?.single(type, this.generatorContext(), type === "delivery" ? "ChapChap Delivery" : "");
    if (!def) return "none";
    this.acceptMission(type === "matangazo" && def.promo ? { ...def, client: def.promo.name } : def);
    return "started";
  }

  /** Errands: ask the stall for a better price (once). */
  haggle() {
    return this.missions?.haggle() ?? false;
  }

  /** Errands: pay for the shopping list at the counter. */
  purchase() {
    return this.missions?.purchase(this.bike.state) ?? false;
  }

  /** A landmark close enough to photograph (stopped within ~30 m), and whether today's picture is taken. */
  photoSpot(): { name: string; key: string; taken: boolean; first: boolean } | null {
    const s = this.bike.state;
    if (Math.abs(s.speed) > 1.5) return null;
    const near = this.sights.find((p) => Math.hypot(p.x - s.x, p.z - s.z) < 30);
    if (!near) return null;
    const key = `${this.cityId}:${near.name}`;
    const player = usePlayer.getState();
    return { name: near.name, key, taken: player.photoLog[key] === dayKey(), first: !player.photos.includes(key) };
  }

  /** Take the landmark's picture: a new one for the album is worth more XP; once a day per place. */
  takePhoto(): number {
    const spot = this.photoSpot();
    if (!spot || spot.taken) return 0;
    const player = usePlayer.getState();
    const xp = spot.first ? 150 : 40;
    player.patch({ photoLog: { ...player.photoLog, [spot.key]: dayKey() }, photos: spot.first ? [...player.photos, spot.key] : player.photos });
    player.earn(0, xp);
    player.bumpStat("photos", 1);
    events.emit("photo", { id: spot.key });
    const t = currentDictionary().photo;
    events.emit("toast", { text: fmt(spot.first ? t.newInAlbum : t.again, { place: spot.name, xp }), tone: "sky" });
    return xp;
  }

  /** Landmarks in the album for this city, out of how many there are. */
  get album() {
    const photos = usePlayer.getState().photos;
    return { have: this.sights.filter((p) => photos.includes(`${this.cityId}:${p.name}`)).length, total: this.sights.length };
  }

  /** Start this week's city race (from the leaderboard). False if busy or no course fits. */
  startWeeklyRace(): boolean {
    if (this.missions?.active || !this.generator) return false;
    const def = this.generator.weeklyRace(this.generatorContext(), weekKey());
    if (!def) return false;
    this.acceptMission(def);
    return true;
  }

  /** Join the line at the kijiwe stage. */
  stageJoin() {
    if (this.stage?.join()) return true;
    if (stageHud.banned > 0) events.emit("toast", { text: currentDictionary().stage.banned, tone: "coral" });
    return false;
  }

  stageLeave() {
    this.stage?.leave();
  }

  /** Take the waiting customer: your turn, or (`steal`) jumping the line. */
  stageTake(steal: boolean) {
    const stage = this.stage;
    if (!stage || this.missions?.active || !this.generator) return;
    if (!(steal ? stage.steal() : stage.takeTurn())) return;
    const t = currentDictionary();
    if (steal) {
      usePlayer.getState().adjustReputation(-0.15);
      events.emit("toast", { text: t.stage.angry, tone: "coral" });
    }
    this.acceptMission(this.generator.fromStage(this.generatorContext(), { ...stage.spot, name: t.stage.name }));
  }

  /** "Bei gani?": quote the passenger price option `i` (discount, fair, high). */
  quoteFare(i: number) {
    return this.missions?.quote(i, this.bike.state) ?? false;
  }

  /** Take or refuse the passenger's counter-offer. */
  answerCounter(accept: boolean) {
    this.missions?.answerCounter(accept, this.bike.state);
  }

  /** Say something to the passenger. */
  talk(option: TalkOption) {
    this.missions?.talk(option);
  }

  /** Debug: drop the rider next to the current mission stop. */
  debugJumpToTarget() {
    const { targetX, targetZ, active } = missionHud;
    if (!active) return;
    this.bike.place(targetX + 3, targetZ + 3, this.bike.state.heading);
    this.chase.snap();
  }

  /** The petrol station or fundi the rider has stopped at, if any. Fundi only repair. */
  serviceNearby(): { fuel: boolean; police?: boolean; bank?: BankId; wakala?: boolean; bottle?: boolean; name: string } | null {
    const s = this.bike.state;
    if (Math.abs(s.speed) > 1.5) return null;
    let best: (typeof this.services)[number] | null = null;
    let bestD = 22;
    for (const p of this.services) {
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d < bestD && d < (p.fuel ? 22 : p.bank ? 9 : p.wakala || p.bottle ? 7 : 14)) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private vibakaTimer = 10;
  /** Busy places (markets, bus stations) where pickpockets work after dark. */
  private riskSpots: [number, number][] = [];

  /**
   * Vibaka: riding slowly through a market or bus station after dark with a
   * fat roll of cash can cost part of it. The cure is banking it or keeping it
   * on BodaPesa.
   */
  private checkVibaka(dt: number) {
    this.vibakaTimer -= dt;
    if (this.vibakaTimer > 0) return;
    this.vibakaTimer = 10;
    const player = usePlayer.getState();
    const s = this.bike.state;
    if (env.night < 0.5 || player.wallet <= CASH_RISK_LEVEL || Math.abs(s.speed) > 3 || !player.tutorialDone) return;
    if (!this.riskSpots.some(([x, z]) => (x - s.x) ** 2 + (z - s.z) ** 2 < 110 ** 2)) return;
    if (Math.random() > 0.08) return;
    const lost = Math.min(80_000, Math.round((player.wallet * (0.15 + Math.random() * 0.15)) / 500) * 500);
    player.patch({ wallet: player.wallet - lost });
    events.emit("toast", { text: fmt(currentDictionary().bank.vibaka, { amount: formatTzs(lost) }), tone: "coral" });
  }

  private navTimer = 0;
  /** Kilometres already moved off the odometer into the save (telemetry adds the live odometer on top). */
  private telemetryKm = 0;
  /** The rider asked for directions to the nearest sheli ("Tafuta sheli"). */
  private fuelNav = false;
  private fuelTarget: { x: number; z: number; name: string } | null = null;
  private fuelRouteAge = 0;
  private pinRouteAge = 0;
  /** Chevrons on the road for the rider's own trips (a place picked on the map, or a sheli); jobs have their own. */
  private tripGuide = new RouteGuide(TRIP_COLOR, 1.25, 0.62);

  /** Shortest drive over the lane network from the rider to (x, z), as a flat [x, z, ...] polyline. */
  planRoute(x: number, z: number): Float32Array | null {
    const nav = this.nav;
    if (!nav) return null;
    const bike = this.bike.state;
    const from = nav.nearestOnNetwork(bike.x, bike.z);
    const lane = nav.lanes[from.lane]!;
    const target = nav.nearestNode(x, z);
    const best = [lane.to, lane.from]
      .map((node) => {
        const lanes = nav.route(node, target) ?? [];
        return { node, lanes, cost: Math.hypot(nav.nodeX(node) - bike.x, nav.nodeZ(node) - bike.z) + lanes.reduce((sum, id) => sum + nav.lanes[id]!.length, 0) };
      })
      .sort((a, b) => a.cost - b.cost)[0]!;
    const pts: number[] = [bike.x, bike.z, from.x, from.z, nav.nodeX(best.node), nav.nodeZ(best.node)];
    for (const id of best.lanes) {
      const l = nav.lanes[id]!;
      for (let i = 2; i < l.pts.length; i += 2) pts.push(l.pts[i]!, l.pts[i + 1]!);
    }
    pts.push(x, z);
    return new Float32Array(pts);
  }

  /** The nearest point on a road to (x, z): where a tap on the map becomes a destination. */
  snapToRoad(x: number, z: number) {
    const n = this.nav?.nearestOnNetwork(x, z);
    return n ? { x: n.x, z: n.z, distance: n.distance } : null;
  }

  /** The nearest petrol: a sheli, or, with the tank all but dry, a roadside bottle seller if one is closer. */
  private nearestFuel() {
    const s = this.bike.state;
    const dry = s.fuel / this.stats.tank < 0.06;
    return this.services.filter((p) => p.fuel || (dry && p.bottle)).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0] ?? null;
  }

  /** Litres the tank can still take. */
  get tankRoom() {
    return Math.max(0, this.stats.tank - this.bike.state.fuel);
  }

  /** Price per litre from a roadside seller: a good deal dearer than the pump. */
  get bottlePrice() {
    return Math.round((this.fuelPrice * 1.3) / 100) * 100;
  }

  /** Buy petrol by the litre from a roadside seller (cash only). Now and then it's been watered down. */
  buyBottleFuel(liters: number): boolean {
    const s = this.bike.state;
    const room = this.stats.tank - s.fuel;
    const l = Math.min(liters, room);
    if (l <= 0.05) return false;
    const cost = Math.ceil((l * this.bottlePrice) / 50) * 50;
    if (!usePlayer.getState().spend(cost)) return false;
    s.fuel += l;
    events.emit("refuel", { liters: l, cost });
    if (Math.random() < 0.12) {
      // Dirty petrol: the engine coughs and takes a little damage.
      s.damage = Math.min(100, s.damage + 6);
      events.emit("toast", { text: currentDictionary().station.dirtyFuel, tone: "coral" });
    }
    this.saveRide();
    return true;
  }

  /** Turn directions to the nearest sheli on or off. Returns whether they're on. */
  toggleFuelNav(): boolean {
    this.fuelNav = !this.fuelNav && Boolean(this.nearestFuel());
    if (this.fuelNav) this.setDestination(null);
    this.fuelTarget = null;
    navHud.fuelRoute = null;
    this.navTimer = 0;
    return this.fuelNav;
  }

  get fuelNavOn() {
    return this.fuelNav;
  }

  /** Ride to a place picked on the map (or stop, with null): the arrow, the minimap and chevrons on the road lead there. */
  setDestination(dest: { x: number; z: number; label: string } | null) {
    navHud.pin = dest;
    navHud.pinRoute = dest ? this.planRoute(dest.x, dest.z) : null;
    this.pinRouteAge = 0;
    if (dest) {
      this.fuelNav = false;
      navHud.fuelRoute = null;
      this.tripGuide.setStop({ x: dest.x, z: dest.z, color: TRIP_COLOR });
    } else this.tripGuide.setStop(null);
    this.navTimer = 0;
  }

  /** Refresh the top-of-screen arrow: to the rider's own destination, along the job route, or to a sheli when asked or when the tank runs low. */
  private updateNav(dt: number) {
    this.navTimer -= dt;
    this.fuelRouteAge += dt;
    this.pinRouteAge += dt;
    const s = this.bike.state;
    // Chevrons follow the rider every frame; the route itself is re-planned below.
    const trip = navHud.pin ? navHud.pinRoute : this.fuelNav ? navHud.fuelRoute : null;
    this.tripGuide.setColor(navHud.pin ? TRIP_COLOR : FUEL_COLOR);
    this.tripGuide.update(dt, trip, s.x, s.z, 0);
    if (this.navTimer > 0) return;
    this.navTimer = 0.12;
    const lowFuel = s.fuel / this.stats.tank < 0.2;

    // A sheli the rider asked for comes first, then their own destination, then the job.
    const pin = navHud.pin;
    if (pin && !this.fuelNav) {
      const dist = Math.hypot(pin.x - s.x, pin.z - s.z);
      if (dist < 18) {
        events.emit("toast", { text: fmt(currentDictionary().nav.arrived, { place: pin.label }), tone: "sky" });
        this.setDestination(null);
        navHud.mode = null;
        return;
      }
      // Re-plan every few seconds so a missed turn gets a new way round.
      if (this.pinRouteAge > 3 || !navHud.pinRoute) {
        navHud.pinRoute = this.planRoute(pin.x, pin.z);
        this.pinRouteAge = 0;
      }
      if (navHud.pinRoute) {
        this.guideAlong("pin", navHud.pinRoute, pin.label, dist);
        return;
      }
    }
    if (missionHud.active && missionHud.route && missionHud.route.length >= 4 && !this.fuelNav) {
      this.guideAlong("job", missionHud.route, missionHud.stopName, missionHud.distance);
      return;
    }
    if (this.fuelNav || (lowFuel && !missionHud.active)) {
      const near = this.nearestFuel();
      if (!near) {
        this.fuelNav = false;
        navHud.mode = null;
        return;
      }
      // Re-plan every few seconds (or when a nearer sheli comes up) so turns follow the rider.
      if (!this.fuelTarget || this.fuelTarget !== near || this.fuelRouteAge > 3 || !navHud.fuelRoute) {
        this.fuelTarget = near;
        navHud.fuelRoute = this.planRoute(near.x, near.z);
        this.fuelRouteAge = 0;
      }
      const dist = Math.hypot(near.x - s.x, near.z - s.z);
      if (this.fuelNav && dist < 16) {
        // Arrived: hand over to the station panel.
        this.fuelNav = false;
        navHud.fuelRoute = null;
        navHud.mode = null;
        events.emit("toast", { text: currentDictionary().nav.atFuel, tone: "sky" });
        return;
      }
      if (navHud.fuelRoute) {
        this.guideAlong("fuel", navHud.fuelRoute, near.name, dist);
        navHud.asked = this.fuelNav;
        return;
      }
    }
    navHud.fuelRoute = null;
    navHud.mode = null;
  }

  /** Point the arrow down the route and find the next turn. */
  private guideAlong(mode: "job" | "fuel" | "pin", route: Float32Array, label: string, distance: number) {
    const s = this.bike.state;
    const fx = -Math.sin(s.heading), fz = -Math.cos(s.heading);
    // Unwrapped against the last value so the arrow turns the short way.
    const relative = (vx: number, vz: number) => {
      const a = Math.atan2(vx * -fz + vz * fx, vx * fx + vz * fz);
      const tau = Math.PI * 2;
      return navHud.angle + ((((a - navHud.angle) % tau) + tau * 1.5) % tau) - Math.PI;
    };
    // Resample the route from the point nearest the rider.
    let start = 0, best = Infinity;
    for (let i = 0; i < route.length; i += 2) {
      const d = (route[i]! - s.x) ** 2 + (route[i + 1]! - s.z) ** 2;
      if (d < best) {
        best = d;
        start = i;
      }
    }
    const cum: number[] = [0];
    for (let i = start + 2; i < route.length; i += 2) cum.push(cum[cum.length - 1]! + Math.hypot(route[i]! - route[i - 2]!, route[i + 1]! - route[i - 1]!));
    const total = cum[cum.length - 1]!;
    const at = (d: number): [number, number] => {
      const t = Math.min(Math.max(d, 0), total);
      let k = 1;
      while (k < cum.length - 1 && cum[k]! < t) k++;
      const a = start + (k - 1) * 2, b = start + k * 2;
      if (b >= route.length) return [route[route.length - 2]!, route[route.length - 1]!];
      const f = (t - cum[k - 1]!) / Math.max(cum[k]! - cum[k - 1]!, 1e-3);
      return [route[a]! + (route[b]! - route[a]!) * f, route[a + 1]! + (route[b + 1]! - route[a + 1]!) * f];
    };
    const dir = (d: number) => {
      const [ax, az] = at(d), [bx, bz] = at(d + 10);
      const l = Math.hypot(bx - ax, bz - az) || 1;
      return [(bx - ax) / l, (bz - az) / l] as const;
    };
    const [lx, lz] = at(Math.min(22, total));
    navHud.mode = mode;
    navHud.asked = false;
    navHud.angle = relative(lx - s.x, lz - s.z);
    navHud.distance = Math.max(distance, total);
    navHud.label = label;
    navHud.turn = "straight";
    navHud.turnIn = 0;
    if (total < 30) navHud.turn = "arrive";
    else {
      const [rx, rz] = dir(4);
      for (let d = 10; d < Math.min(total - 10, 220); d += 5) {
        const [dx, dz] = dir(d);
        const turn = Math.atan2(dx * -rz + dz * rx, dx * rx + dz * rz);
        if (Math.abs(turn) > 0.6) {
          navHud.turn = Math.abs(turn) > 2.4 ? "uturn" : turn > 0 ? "right" : "left";
          navHud.turnIn = d;
          break;
        }
      }
    }
  }

  /** Pump price here, TZS per litre. */
  get fuelPrice() {
    return FUEL_PRICE[this.cityId];
  }

  refuelCost() {
    return Math.ceil(((this.stats.tank - this.bike.state.fuel) * this.fuelPrice) / 50) * 50;
  }

  repairCost() {
    return Math.ceil((this.bike.state.damage * REPAIR_RATE[this.cityId]) / 50) * 50;
  }

  /** Fill up as far as the wallet allows. Returns liters added. */
  /** Fill up, paying cash or (`bodapesa`) with Lipa kwa BodaPesa at the pump. */
  refuel(bodapesa = false): number {
    const s = this.bike.state;
    const player = usePlayer.getState();
    const funds = bodapesa ? player.bodapesa : player.wallet;
    const want = this.stats.tank - s.fuel;
    const liters = Math.min(want, funds / this.fuelPrice);
    if (liters <= 0.01) return 0;
    const cost = Math.min(funds, Math.ceil((liters * this.fuelPrice) / 50) * 50);
    if (bodapesa) {
      player.patch({ bodapesa: player.bodapesa - cost });
      const t = currentDictionary();
      usePhone.getState().push({ from: t.phone.pesaName, kind: "pesa", amount: -cost, at: clockText(), text: fmt(t.phone.pesaOut, { amount: formatTzs(cost), who: t.station.title }) });
    } else player.spend(cost);
    s.fuel += liters;
    events.emit("refuel", { liters, cost });
    this.saveRide();
    return liters;
  }


  repair(): boolean {
    const cost = this.repairCost();
    if (cost <= 0 || !usePlayer.getState().spend(cost)) return false;
    this.bike.state.damage = 0;
    this.saveRide();
    return true;
  }

  /** Wire game events to sound, and keep volumes and focus in sync. */
  private attachAudio() {
    const unlock = () => {
      audio.unlock();
      const s = useSettings.getState();
      audio.setVolumes(s.masterVolume, s.musicVolume, s.sfxVolume);
      if (s.musicVolume > 0 && s.radio !== "off") this.applyRadio();
    };
    const onVisibility = () => {
      if (document.hidden) {
        audio.suspend();
        // Live streams stay connected so the lock screen and the system media
        // controls can keep the station playing. Engine audio still suspends.
      } else {
        audio.resume();
      }
    };
    void loadLiveStations().then((list) => {
      const s = useSettings.getState();
      if (!s.radio.startsWith("live:")) return;
      // A saved station that's no longer listed: back to the house station. Otherwise tune in now the list is here.
      if (!list.some((st) => st.id === s.radio)) s.set("radio", "kijiweni");
      else if (audio.ready && s.musicVolume > 0) this.applyRadio();
    });
    // A live stream that won't play (offline, down, blocked): back to the house station.
    livePlayer.onError = (station) => {
      events.emit("toast", { text: fmt(currentDictionary().radio.liveDown, { name: station.name }), tone: "coral" });
      useSettings.getState().set("radio", "kijiweni");
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", onVisibility);
    setRealTime(useSettings.getState().realClock);
    const unsubSettings = useSettings.subscribe((s) => {
      setRealTime(s.realClock);
      audio.setVolumes(s.masterVolume, s.musicVolume, s.sfxVolume);
      if (s.musicVolume <= 0 || s.radio === "off") {
        audio.stopMusic();
        livePlayer.stop();
      } else if (audio.ready) this.applyRadio();
      livePlayer.setVolume(s.masterVolume * s.musicVolume);
    });
    const offs = [
      events.on("horn", () => audio.horn(this.missions?.active?.type === "dharura")),
      events.on("honked", ({ x, z, kind, mood }) => {
        const s = this.bike.state;
        const dx = x - s.x, dz = z - s.z;
        const d = Math.hypot(dx, dz);
        // Pan by where the horn is relative to the rider's right hand.
        const pan = d > 0.1 ? (dx * Math.cos(s.heading) - dz * Math.sin(s.heading)) / d : 0;
        audio.honk(d, kind, mood, pan * 0.8);
      }),
      events.on("ringing", ({ on }) => audio.ring(on)),
      events.on("sms", () => audio.chime()),
      attachVoices(),
      events.on("collision", ({ speed }) => audio.crash(speed / 10)),
      events.on("nearMiss", () => audio.whoosh()),
      events.on("delivery", () => audio.coin()),
      events.on("collectible", () => audio.coin()),
      events.on("refuel", () => audio.click()),
      events.on("levelUp", () => audio.levelUp()),
      events.on("checkpoint", () => audio.whistle()),
      events.on("missionFailed", () => audio.fail()),
    ];
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubSettings();
      offs.forEach((off) => off());
      audio.stopContinuous();
      audio.stopMusic();
      audio.ring(false);
      livePlayer.stop();
      livePlayer.onError = null;
    };
  }

  private liveNoticeShown = false;

  /** Start whichever station is selected: the procedural ones through Web Audio, live ones as a stream. */
  private receptionTimer = 0;

  /**
   * FM reception: clear in town, fading toward the edge of the map, a
   * little crackle in a heavy storm. Live streams fade the same way.
   */
  private updateReception(dt: number) {
    this.receptionTimer -= dt;
    if (this.receptionTimer > 0) return;
    this.receptionTimer = 0.25;
    const { minX, maxX, minZ, maxZ } = this.manifest.bounds;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const radius = Math.max(maxX - minX, maxZ - minZ) / 2;
    const s = this.bike.state;
    const d = Math.hypot(s.x - cx, s.z - cz) / Math.max(radius, 1);
    const edge = Math.min(1, Math.max(0, (d - 0.55) / 0.4));
    const signal = Math.max(0, 1 - edge * edge * (3 - 2 * edge) - (env.rain > 0.8 ? 0.15 : 0));
    radioHud.signal = signal;
    const settings = useSettings.getState();
    const on = settings.radio !== "off" && settings.musicVolume > 0;
    audio.setRadioSignal(signal, on);
    livePlayer.setVolume(settings.masterVolume * settings.musicVolume * Math.max(0.1, signal ** 0.8));
  }

  private applyRadio() {
    const s = useSettings.getState();
    const live = liveStations.find((st) => st.id === s.radio);
    if (live) {
      audio.stopMusic();
      const started = livePlayer.play(live, s.masterVolume * s.musicVolume, "follow");
      if (started && !this.liveNoticeShown) {
        this.liveNoticeShown = true;
        events.emit("toast", { text: currentDictionary().radio.liveData, tone: "sky" });
      }
    } else {
      livePlayer.stop();
      audio.startMusic();
    }
  }

  private applyDensity() {
    const d = DENSITY[this.quality];
    this.traffic?.setDensity(d.traffic);
    this.peds?.setDensity(Math.round(d.peds * (this.marketDay ? 1.4 : 1)));
  }

  update(dt: number, camera: THREE.PerspectiveCamera) {
    dt = Math.min(dt, MAX_DT);
    const settings = useSettings.getState();
    if (controls.pressed.camera) settings.set("cameraView", settings.cameraView === "chase" ? "fpv" : "chase");
    if (controls.pressed.pause) this.onPauseRequest?.();
    if (settings.quality !== this.quality) {
      this.quality = settings.quality;
      this.applyDensity();
    }
    if (this.paused) {
      audio.stopContinuous();
      clearPressed();
      return;
    }
    updateEnvironment(dt);
    this.tickDay();
    this.wetness = env.wetness;
    this.rain.update(dt, camera, env.rain * (DENSITY[this.quality].rain / DENSITY.high.rain));
    if (!this.riding) {
      clearPressed();
      return;
    }
    pollControls(dt, { autoThrottle: settings.autoThrottle, tilt: settings.tiltSteer });
    if (controls.pressed.horn) events.emit("horn", {});

    const physicsEnv = { world: this.index, stats: this.stats, wetness: this.wetness, fuelUse: this.fuelUse };
    this.bike.update(dt, controls, physicsEnv);
    const s = this.bike.state;
    this.model.update(s, dt);

    // City life.
    this.obstacles.length = 0;
    this.peds?.obstacles(this.obstacles);
    this.streetEvents?.obstacles(this.obstacles);
    this.traffic?.update(dt, this.bike, this.stats, this.obstacles);
    this.peds?.update(dt, this.bike, this.stats, this.traffic ?? undefined);
    this.civic?.update(dt);
    this.markets?.update(env.rain);
    this.checkVibaka(dt);
    const player = usePlayer.getState();
    const { gear, custom } = usePlayer.getState();
    const licence = { valid: this.licenceHours > 0, hesabu: HESABU[this.cityId], helmet: gear.helmet, reflector: gear.reflector && custom.vest, permit: this.permitHours > 0 };
    const fine = (amount: number) => player.spend(Math.min(usePlayer.getState().wallet, amount));
    const rep = (d: number) => usePlayer.getState().adjustReputation(d);
    this.checkpoints?.update(dt, s, fine, rep, licence);
    this.police?.update(dt, s, {
      licenceValid: licence.valid,
      hesabu: licence.hesabu,
      fine,
      adjustRep: rep,
      scare: () => this.missions?.scare(),
    });
    if (this.police?.chasing) {
      const dx = policeHud.px - s.x, dz = policeHud.pz - s.z;
      const d = Math.hypot(dx, dz) || 1;
      audio.siren(d, ((dx * Math.cos(s.heading) - dz * Math.sin(s.heading)) / d) * 0.8);
    } else audio.siren(Infinity, 0);

    this.lights?.update(dt);
    this.checkRedLight(s);
    this.missions?.update(dt, s);
    this.stage?.update(dt, s, Boolean(this.missions?.active));
    this.streetEvents?.update(dt, this.bike, this.stats, this.missions?.active?.type === "mbio" || Boolean(this.police?.chasing));
    this.phone?.update(dt);
    this.radio?.update(dt);
    this.updateReception(dt);
    const skid = s.drifting ? 1 : controls.brake > 0.5 && s.speed > 6 ? 0.6 : 0;
    const crowd = Math.min(1, (this.peds?.countNear(s.x, s.z, 45) ?? 0) / 10);
    audio.update(s.speed, controls.throttle, skid, env.rain, crowd, this.riding && s.fuel > 0);
    this.collectibles?.update(dt, s.x, s.z);
    this.places?.update(dt, s.x, s.z, s.heading);
    this.busStandLife(dt, s.x, s.z);

    // Juice: red-earth dust on dirt, spray on wet tarmac, exhaust when idling.
    const fx = -Math.sin(s.heading), fz = -Math.cos(s.heading);
    const v = Math.abs(s.speed);
    const rate = s.surface === "earth" || s.surface === "dirt" || s.surface === "path" ? v * 2.2 : s.surface === "mud" ? v * 1.5 : env.wetness > 0.3 ? v * 1.2 : v < 2 ? 3 : 0;
    this.emitCarry += rate * dt;
    while (this.emitCarry >= 1) {
      this.emitCarry -= 1;
      const kind = s.surface === "mud" ? "mud" : s.surface === "earth" || s.surface === "dirt" || s.surface === "path" ? "dust" : env.wetness > 0.3 && v > 2 ? "spray" : "exhaust";
      const back = kind === "exhaust" ? 1.0 : 0.75;
      this.particles.emit(kind, s.x - fx * back + (kind === "exhaust" ? -fz * 0.17 : 0), kind === "exhaust" ? 0.35 : 0.15, s.z - fz * back + (kind === "exhaust" ? fx * 0.17 : 0), -fx * v * 0.15, 0.4, -fz * v * 0.15);
    }
    this.particles.update(dt);

    // Headlight comes on at dusk and in the rain.
    this.headlight.intensity = Math.max(env.night, env.rain * 0.4) * 60;
    this.headlight.position.set(s.x + fx * 0.6, 1.05, s.z + fz * 0.6);
    this.headlight.target.position.set(s.x + fx * 16, 0, s.z + fz * 16);
    this.chase.update(camera, s, dt, this.index, settings.cameraView, controls.boost && s.boost > 0.02);

    // Stream the city ahead of the rider.
    streamFocus.x = s.x - Math.sin(s.heading) * Math.min(60, s.speed * 3);
    streamFocus.z = s.z - Math.cos(s.heading) * Math.min(60, s.speed * 3);

    hud.speedKmh = Math.abs(s.speed) * 3.6;
    if (hud.speedKmh > Math.max(20, this.topSpeedSeen + 5)) {
      this.topSpeedSeen = hud.speedKmh;
      events.emit("topSpeed", { kmh: Math.round(hud.speedKmh) });
    }
    hud.fuel = s.fuel / this.stats.tank;
    hud.fuelLiters = s.fuel;
    hud.boost = s.boost;
    hud.boosting = controls.boost && s.boost > 0.02 && controls.throttle > 0.1;
    hud.damage = s.damage;
    hud.surface = s.surface;
    hud.outOfFuel = s.fuel <= 0;
    hud.heading = s.heading;
    const surface = this.index.surfaceAt(s.x, s.z);
    hud.limitKmh = surface.cls >= 0 ? ROAD_SPEED[ROAD_CLASSES[surface.cls]!] : 30;
    const frac = Math.abs(s.speed) / this.stats.topSpeed;
    hud.gear = Math.abs(s.speed) < 0.5 ? 0 : frac < 0.18 ? 1 : frac < 0.36 ? 2 : frac < 0.55 ? 3 : frac < 0.75 ? 4 : 5;
    const ahead = this.lights?.ahead(s.x, s.z, fx, fz) ?? null;
    hud.light = ahead?.signal ?? null;
    hud.lightDistance = ahead?.distance ?? 0;
    hud.headlight = this.headlight.intensity > 1;
    hud.x = s.x;
    hud.z = s.z;
    this.updateNav(dt);

    this.sinceSave += dt;
    if (this.sinceSave > SAVE_RIDE_EVERY) {
      this.sinceSave = 0;
      this.saveRide();
    }
    clearPressed();
  }

  private prevHour = env.hour;
  /** Game hours ridden since the licence was last saved. */
  private licenceUsed = 0;

  /** Licence time left (game hours). */
  get licenceHours() {
    return Math.max(0, usePlayer.getState().licenceHours - this.licenceUsed);
  }

  /** LATRA permit time left (game hours); it runs down with the licence. */
  get permitHours() {
    return Math.max(0, usePlayer.getState().gear.permitHours - this.licenceUsed);
  }

  /** Write the hours ridden into the licence and the permit. */
  private commitLicenceUse() {
    if (this.licenceUsed <= 0) return;
    const player = usePlayer.getState();
    player.patch({ licenceHours: this.licenceHours, gear: { ...player.gear, permitHours: this.permitHours } });
    this.licenceUsed = 0;
  }

  /** Renew the LATRA permit (kibali) at a police post. */
  renewPermit(): boolean {
    this.commitLicenceUse();
    const player = usePlayer.getState();
    if (!player.spend(PERMIT_FEE)) return false;
    player.patch({ gear: { ...player.gear, permitHours: player.gear.permitHours + PERMIT_HOURS } });
    events.emit("toast", { text: currentDictionary().gear.permitRenewed, tone: "forest" });
    return true;
  }

  /** The game day: the licence runs down, and at 20:00 the owner of a borrowed boda collects the hesabu. */
  private tickDay() {
    const dh = env.frozen ? 0 : (env.hour - this.prevHour + 24) % 24;
    if (dh > 0 && dh < 1 && this.prevHour < HESABU_HOUR && env.hour >= HESABU_HOUR) {
      this.collectHesabu();
      this.collectFleet();
    }
    this.prevHour = env.hour;
    if (this.fuelUse > 0) this.licenceUsed += dh;
  }

  /** True while riding the Mkopo Ride, which belongs to the owner and costs a daily hesabu. */
  get onLoanBike() {
    return usePlayer.getState().equipped === "mkopo";
  }

  get hesabu() {
    return HESABU[this.cityId];
  }

  /** The owner collects today's hesabu plus anything owed, as far as the wallet allows. */
  collectHesabu() {
    const player = usePlayer.getState();
    if (!this.onLoanBike || !player.tutorialDone) return;
    const due = player.hesabuOwed + this.hesabu;
    // Cash first, then BodaPesa.
    const paid = Math.min(player.wallet + player.bodapesa, due);
    if (paid > 0) player.spendAny(paid);
    player.patch({ hesabuOwed: due - paid });
    const t = currentDictionary();
    const phone = usePhone.getState();
    if (paid > 0) phone.push({ from: t.phone.pesaName, kind: "pesa", amount: -paid, at: clockText(), text: fmt(t.phone.pesaOut, { amount: formatTzs(paid), who: BODA_OWNER }) });
    phone.push({ from: BODA_OWNER, kind: "sms", at: clockText(), text: due - paid > 0 ? fmt(t.hesabu.short, { owed: formatTzs(due - paid) }) : t.hesabu.thanks });
    events.emit("sms", { from: BODA_OWNER });
    if (due - paid > 0) player.adjustReputation(-0.1);
  }

  /**
   * Evening: your fleet riders send their hesabu by BodaPesa. Bikes wear a
   * little every day; a worn one earns half, and now and then a rider comes
   * up short.
   */
  collectFleet() {
    const player = usePlayer.getState();
    if (!player.fleet.length || !player.tutorialDone) return;
    const cityRate = this.hesabu / 10_000;
    let total = 0;
    let short: string | null = null;
    const fleet = player.fleet.map((f) => {
      const daily = FLEET_BIKES.find((b) => b.id === f.bike)?.daily ?? 6_000;
      let pay = daily * cityRate * (f.condition < 30 ? 0.5 : 1);
      if (Math.random() < 0.1) {
        pay *= 0.5;
        short = f.rider;
      }
      pay = Math.round(pay / 100) * 100;
      total += pay;
      return { ...f, condition: Math.max(0, f.condition - (4 + Math.random() * 5)), earned: f.earned + pay };
    });
    player.patch({ fleet, bodapesa: player.bodapesa + total });
    const t = currentDictionary();
    const phone = usePhone.getState();
    phone.push({ from: t.phone.pesaName, kind: "pesa", amount: total, at: clockText(), text: fmt(t.fleet.sms, { amount: formatTzs(total), n: fleet.length }) });
    if (short) phone.push({ from: short, kind: "sms", at: clockText(), text: t.fleet.short });
    events.emit("sms", { from: t.phone.pesaName });
  }

  /** Pay off hesabu owed from the phone. */
  payHesabuDebt(): boolean {
    const player = usePlayer.getState();
    const owed = player.hesabuOwed;
    if (owed <= 0 || !player.spendAny(owed)) return false;
    player.patch({ hesabuOwed: 0 });
    const t = currentDictionary();
    usePhone.getState().push({ from: t.phone.pesaName, kind: "pesa", amount: -owed, at: clockText(), text: fmt(t.phone.pesaOut, { amount: formatTzs(owed), who: BODA_OWNER }) });
    return true;
  }

  /** Renew the leseni at a police post. */
  renewLicence(): boolean {
    this.commitLicenceUse();
    const player = usePlayer.getState();
    if (!player.spend(LICENCE_FEE)) return false;
    player.patch({ licenceHours: player.licenceHours + LICENCE_HOURS });
    events.emit("toast", { text: currentDictionary().hesabu.renewed, tone: "forest" });
    return true;
  }

  /** Crossing a junction on red: police nearby wave you down; otherwise it's a dent in your reputation. */
  private checkRedLight(s: { x: number; z: number; heading: number; speed: number }) {
    if (!this.lights || Math.abs(s.speed) < 3) return;
    const approach = this.lights.approachAt(s.x, s.z, -Math.sin(s.heading), -Math.cos(s.heading));
    if (!approach || approach.distance > 6) {
      if (!approach) this.redRunAt = -1;
      return;
    }
    if (this.lights.signal(approach.lane) !== "red" || this.redRunAt === approach.lane) return;
    this.redRunAt = approach.lane;
    usePlayer.getState().adjustReputation(-0.04);
    if (!this.police?.reportRedLight(this.bike.state)) events.emit("toast", { text: currentDictionary().police.redLightNoPolice, tone: "coral" });
  }

  private sinceConductor = 20;

  /** Daladala conductors call out destinations when you ride past a bus stand. */
  private busStandLife(dt: number, x: number, z: number) {
    this.sinceConductor += dt;
    if (this.sinceConductor < 40 || !this.places) return;
    const station = POI_KINDS.indexOf("bus_station");
    if (this.places.signs.some((sign) => sign.poi.k === station && Math.hypot(sign.x - x, sign.z - z) < 32)) {
      this.sinceConductor = 0;
      say("conductor", currentDictionary().life.conductor);
    }
  }

  saveRide() {
    const s = this.bike.state;
    const player = usePlayer.getState();
    player.setRide(s.fuel, s.damage);
    if (this.licenceUsed > 0) {
      this.commitLicenceUse();
    }
    if (s.odometer > 0) {
      player.bumpStat("distanceKm", s.odometer / 1000);
      this.telemetryKm += s.odometer / 1000;
      s.odometer = 0;
    }
  }

  dispose() {
    this.disposed = true;
    this.saveRide();
    this.traffic?.dispose();
    this.peds?.dispose();
    this.checkpoints?.dispose();
    this.police?.dispose();
    this.lights?.dispose();
    audio.siren(Infinity, 0);
    this.missions?.dispose();
    this.phone?.dispose();
    this.collectibles?.dispose();
    this.places?.dispose();
    this.banners?.dispose();
    this.markets?.dispose();
    this.fuelStations?.dispose();
    this.fuelSellers?.dispose();
    this.streetEvents?.dispose();
    this.stage?.dispose();
    this.frontage?.dispose();
    this.civic?.dispose();
    this.banks?.dispose();
    this.disposeAds?.();
    for (const o of this.landmarkObjects) {
      o.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const material = mesh.material as THREE.MeshBasicMaterial;
        material.map?.dispose();
        material.dispose();
      });
    }
    this.guide.dispose();
    this.tripGuide.dispose();
    navHud.pin = null;
    navHud.pinRoute = null;
    navHud.fuelRoute = null;
    navHud.mode = null;
    this.rain.dispose();
    this.particles.dispose();
    this.ghost.dispose();
    this.detach?.();
    this.unsubPlayer();
    this.offEvents.forEach((off) => off());
    this.model.dispose();
  }
}
