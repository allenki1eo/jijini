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
import { MissionGenerator } from "@/game/missions/generator";
import { MissionRunner, missionHud } from "@/game/missions/MissionRunner";
import { RouteGuide } from "@/game/missions/RouteGuide";
import { unlockedTypes, type MissionDef } from "@/game/missions/types";
import { CITIES } from "@/data/cities/config";
import { FUEL_PRICE_PER_L, REPAIR_PRICE_PER_POINT } from "@/game/vehicles/bikes";
import { useMissions } from "@/stores/missions";
import { attachProgression } from "@/game/systems/progression";
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
  private generator: MissionGenerator | null = null;
  private guide = new RouteGuide();
  /** Fuel stations (m), for refuelling and the minimap. */
  stations: [number, number][] = [];
  private rain: RainField;
  private headlight = new THREE.SpotLight("#FFF1D0", 0, 48, 0.55, 0.65, 1.1);
  private obstacles: Obstacle[] = [];
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
    this.root.add(this.model.root, this.rain.mesh, this.headlight, this.headlight.target, this.guide.group);
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
    this.detach = () => {
      detachInputs();
      detachProgression();
    };
    const [nav, pois] = await Promise.all([
      loadNavNetwork(this.baseUrl),
      fetch(`${this.baseUrl}/pois.json`)
        .then((r) => r.json() as Promise<Poi[]>)
        .catch(() => [] as Poi[]),
    ]);
    if (this.disposed) return;
    this.nav = nav;
    this.pois = pois;
    const cap = DENSITY.high;
    this.traffic = new TrafficSystem(nav, cap.traffic);
    this.peds = new Pedestrians(nav, cap.peds);
    const market = POI_KINDS.indexOf("market");
    this.peds.setHotspots(pois.filter((poi) => poi.k === market).map((poi) => [poi.x / 10, poi.z / 10]));
    this.checkpoints = new Checkpoints(nav, this.manifest.spawn, this.cityId.length * 7919);
    this.applyDensity();
    this.root.add(this.traffic.group, this.peds.group, this.checkpoints.group);
    const fuel = POI_KINDS.indexOf("fuel");
    this.stations = pois.filter((poi) => poi.k === fuel).map((poi) => [poi.x / 10, poi.z / 10]);
    this.generator = new MissionGenerator(nav, pois);
    this.missions = new MissionRunner(nav, this.model, this.guide, this.cityId);
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

  /** Debug: drop the rider next to the current mission stop. */
  debugJumpToTarget() {
    const { targetX, targetZ, active } = missionHud;
    if (!active) return;
    this.bike.place(targetX + 3, targetZ + 3, this.bike.state.heading);
    this.chase.snap();
  }

  /** Fuel station within reach, if the rider has stopped at one. */
  stationNearby(): boolean {
    const s = this.bike.state;
    return Math.abs(s.speed) < 1.5 && this.stations.some(([x, z]) => Math.hypot(x - s.x, z - s.z) < 22);
  }

  refuelCost() {
    return Math.ceil(((this.stats.tank - this.bike.state.fuel) * FUEL_PRICE_PER_L) / 50) * 50;
  }

  repairCost() {
    return Math.ceil((this.bike.state.damage * REPAIR_PRICE_PER_POINT) / 50) * 50;
  }

  /** Fill up as far as the wallet allows. Returns liters added. */
  refuel(): number {
    const s = this.bike.state;
    const player = usePlayer.getState();
    const want = this.stats.tank - s.fuel;
    const liters = Math.min(want, player.wallet / FUEL_PRICE_PER_L);
    if (liters <= 0.01) return 0;
    const cost = Math.ceil((liters * FUEL_PRICE_PER_L) / 50) * 50;
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

    // Headlight comes on at dusk and in the rain.
    const fx = -Math.sin(s.heading), fz = -Math.cos(s.heading);
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
    this.guide.dispose();
    this.rain.dispose();
    this.detach?.();
    this.unsubPlayer();
    this.offEvents.forEach((off) => off());
    this.model.dispose();
  }
}
