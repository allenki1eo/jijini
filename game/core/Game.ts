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
import { env, updateEnvironment } from "@/game/systems/environment";
import { Checkpoints } from "@/game/traffic/Checkpoints";
import { loadNavNetwork, type NavNetwork } from "@/game/traffic/NavNetwork";
import { Pedestrians } from "@/game/traffic/Pedestrians";
import { TrafficSystem, type Obstacle } from "@/game/traffic/TrafficSystem";
import { POI_KINDS, type Poi } from "@/game/world/format";
import { RainField } from "@/game/world/RainField";
import { PlaceSigns, synthesizeBusStops } from "@/game/world/PlaceSigns";
import { fetchJson } from "@/lib/fetchJson";
import { Collectibles, HELMET_REWARD } from "@/game/world/Collectibles";
import { Particles } from "@/game/world/Particles";
import { buildLandmark } from "@/game/world/landmarks";
import { makeProjector } from "@/game/world/projection";
import { MissionGenerator } from "@/game/missions/generator";
import { MissionRunner, missionHud, type TalkOption } from "@/game/missions/MissionRunner";
import { PhoneSystem } from "@/game/phone/PhoneSystem";
import { RouteGuide } from "@/game/missions/RouteGuide";
import { unlockedTypes, type MissionDef, type MissionType } from "@/game/missions/types";
import { CITIES } from "@/data/cities/config";
import { FUEL_PRICE, REPAIR_RATE } from "@/data/prices";
import { useMissions } from "@/stores/missions";
import { attachProgression } from "@/game/systems/progression";
import { audio } from "@/game/audio/AudioEngine";
import { attachVoices } from "@/game/audio/voices";
import { say } from "@/game/systems/speech";
import { currentDictionary } from "@/i18n";
import type { Quality } from "@/stores/settings";
import { attachInputs, clearPressed, controls, pollControls } from "./controls";
import { events } from "./events";
import { hud } from "./hud";

const SAVE_RIDE_EVERY = 3;
const DENSITY: Record<Quality, { traffic: number; peds: number; rain: number }> = {
  low: { traffic: 12, peds: 16, rain: 500 },
  medium: { traffic: 22, peds: 30, rain: 900 },
  high: { traffic: 34, peds: 48, rain: 1500 },
};
const MAX_DT = 1 / 20;

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
  missions: MissionRunner | null = null;
  phone: PhoneSystem | null = null;
  private generator: MissionGenerator | null = null;
  private guide = new RouteGuide();
  private collectibles: Collectibles | null = null;
  /** Signposts, shelters and labels for real places. */
  places: PlaceSigns | null = null;
  private landmarkObjects: THREE.Object3D[] = [];
  /** Petrol stations and fundi (mechanics), for refuelling and repairs. */
  private services: { x: number; z: number; fuel: boolean; name: string }[] = [];
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
    this.root.add(this.model.root, this.rain.mesh, this.headlight, this.headlight.target, this.guide.group, this.particles.points, this.ghost.model.root);
    this.stats = currentRideStats(p);
    this.bike.place(manifest.spawn.x, manifest.spawn.z, manifest.spawn.heading);
    this.bike.state.fuel = Math.min(p.fuel, this.stats.tank);
    this.bike.state.damage = p.damage;
    this.model.setBike(p.equipped, p.custom);
    // Garage changes made mid-session (or a fresh hydrate) apply immediately.
    this.unsubPlayer = usePlayer.subscribe((s, prev) => {
      if (s.equipped !== prev.equipped || s.upgrades !== prev.upgrades || s.custom !== prev.custom) {
        this.stats = currentRideStats(s);
        this.model.setBike(s.equipped, s.custom);
      }
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
      events.on("collision", ({ speed, kind }) => {
        this.chase.kick(Math.min(1, speed / 10));
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
    const detachAudio = this.attachAudio();
    this.detach = () => {
      detachInputs();
      detachProgression();
      detachAudio();
    };
    const [nav, mapped] = await Promise.all([
      loadNavNetwork(this.baseUrl),
      fetchJson<Poi[]>(`${this.baseUrl}/pois.json`).catch(() => [] as Poi[]),
    ]);
    if (this.disposed) return;
    this.nav = nav;
    // Main roads without mapped daladala stops get them, so every city has places to wait for a ride.
    const pois = [...mapped, ...synthesizeBusStops(nav, mapped)];
    this.pois = pois;
    this.places = new PlaceSigns(pois);
    this.root.add(this.places.group);
    const cap = DENSITY.high;
    this.traffic = new TrafficSystem(nav, cap.traffic);
    this.peds = new Pedestrians(nav, cap.peds);
    const market = POI_KINDS.indexOf("market");
    this.peds.setHotspots(pois.filter((poi) => poi.k === market).map((poi) => [poi.x / 10, poi.z / 10]));
    this.checkpoints = new Checkpoints(nav, this.manifest.spawn, this.cityId.length * 7919);
    this.applyDensity();
    this.root.add(this.traffic.group, this.peds.group, this.checkpoints.group);
    const fuel = POI_KINDS.indexOf("fuel");
    const garage = POI_KINDS.indexOf("garage");
    this.services = pois
      .filter((poi) => poi.k === fuel || poi.k === garage)
      .map((poi) => ({ x: (poi.r?.[0] ?? poi.x) / 10, z: (poi.r?.[1] ?? poi.z) / 10, fuel: poi.k === fuel, name: poi.n ?? poi.b ?? "" }));
    // Landmarks: placed from lat/lon, solid to ride into, and tourist photo stops.
    const { project } = makeProjector(this.manifest.origin.lat, this.manifest.origin.lon);
    const sights: { x: number; z: number; name: string }[] = [];
    for (const lm of CITIES[this.cityId].landmarks) {
      const built = buildLandmark(lm.id);
      if (!built) continue;
      const [x, z] = project(lm.lat, lm.lon);
      built.object.position.set(x, 0, z);
      this.root.add(built.object);
      this.landmarkObjects.push(built.object);
      if (built.walls.length) this.index.addChunk(`landmark:${lm.id}`, new Float32Array(built.walls.map((v, i) => v + (i % 2 === 0 ? x : z))), new Float32Array());
      sights.push({ x, z, name: lm.name });
    }
    this.collectibles = new Collectibles(nav, this.cityId, usePlayer.getState().collectibles, (id) => {
      const p = usePlayer.getState();
      p.patch({ collectibles: [...p.collectibles, id] });
      p.earn(HELMET_REWARD, 25);
    });
    this.root.add(this.collectibles.group);
    this.generator = new MissionGenerator(nav, pois, sights, this.cityId);
    this.missions = new MissionRunner(nav, this.model, this.guide, this.cityId, this.ghost);
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
      fare: Math.round((o.fare * (0.85 + rep * 0.06)) / 100) * 100,
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

  /** Errands: ask the stall for a better price (once). */
  haggle() {
    return this.missions?.haggle() ?? false;
  }

  /** Errands: pay for the shopping list at the counter. */
  purchase() {
    return this.missions?.purchase(this.bike.state) ?? false;
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
  serviceNearby(): { fuel: boolean; name: string } | null {
    const s = this.bike.state;
    if (Math.abs(s.speed) > 1.5) return null;
    let best: (typeof this.services)[number] | null = null;
    let bestD = 22;
    for (const p of this.services) {
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d < bestD && (p.fuel || d < 14)) {
        bestD = d;
        best = p;
      }
    }
    return best;
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
  refuel(): number {
    const s = this.bike.state;
    const player = usePlayer.getState();
    const want = this.stats.tank - s.fuel;
    const liters = Math.min(want, player.wallet / this.fuelPrice);
    if (liters <= 0.01) return 0;
    const cost = Math.ceil((liters * this.fuelPrice) / 50) * 50;
    player.spend(Math.min(cost, player.wallet));
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
      if (s.musicVolume > 0) audio.startMusic();
    };
    const onVisibility = () => (document.hidden ? audio.suspend() : audio.resume());
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", onVisibility);
    const unsubSettings = useSettings.subscribe((s) => {
      audio.setVolumes(s.masterVolume, s.musicVolume, s.sfxVolume);
      if (s.musicVolume <= 0) audio.stopMusic();
      else if (audio.ready) audio.startMusic();
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
    };
  }

  private applyDensity() {
    const d = DENSITY[this.quality];
    this.traffic?.setDensity(d.traffic);
    this.peds?.setDensity(d.peds);
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
    this.traffic?.update(dt, this.bike, this.stats, this.obstacles);
    this.peds?.update(dt, this.bike, this.stats);
    this.checkpoints?.update(
      dt,
      s,
      (amount) => {
        const player = usePlayer.getState();
        player.spend(Math.min(player.wallet, amount));
      },
      (d) => usePlayer.getState().adjustReputation(d),
    );

    this.missions?.update(dt, s);
    this.phone?.update(dt);
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
    hud.x = s.x;
    hud.z = s.z;

    this.sinceSave += dt;
    if (this.sinceSave > SAVE_RIDE_EVERY) {
      this.sinceSave = 0;
      this.saveRide();
    }
    clearPressed();
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
    if (s.odometer > 0) {
      player.bumpStat("distanceKm", s.odometer / 1000);
      s.odometer = 0;
    }
  }

  dispose() {
    this.disposed = true;
    this.saveRide();
    this.traffic?.dispose();
    this.peds?.dispose();
    this.checkpoints?.dispose();
    this.missions?.dispose();
    this.phone?.dispose();
    this.collectibles?.dispose();
    this.places?.dispose();
    for (const o of this.landmarkObjects) {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose();
    }
    this.guide.dispose();
    this.rain.dispose();
    this.particles.dispose();
    this.ghost.dispose();
    this.detach?.();
    this.unsubPlayer();
    this.offEvents.forEach((off) => off());
    this.model.dispose();
  }
}
