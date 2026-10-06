/**
 * The game orchestrator: owns every simulation system and ticks them from a
 * single frame callback. React renders meshes and HUD from its state but
 * never drives the simulation.
 */
import type * as THREE from "three";
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
import { attachInputs, clearPressed, controls, pollControls } from "./controls";
import { events } from "./events";
import { hud } from "./hud";

const SAVE_RIDE_EVERY = 3;
const MAX_DT = 1 / 20;

export class Game {
  readonly index = new WorldIndex();
  readonly bike = new BikePhysics();
  readonly model = new BikeModel();
  readonly chase = new ChaseCamera();
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
  private detach: (() => void) | null = null;
  private unsubPlayer: () => void;
  private offEvents: (() => void)[] = [];

  constructor(
    readonly cityId: CityId,
    readonly manifest: CityManifest,
  ) {
    const p = usePlayer.getState();
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

  start() {
    this.detach = attachInputs();
  }

  update(dt: number, camera: THREE.PerspectiveCamera) {
    dt = Math.min(dt, MAX_DT);
    const settings = useSettings.getState();
    if (controls.pressed.camera) settings.set("cameraView", settings.cameraView === "chase" ? "fpv" : "chase");
    if (controls.pressed.pause) this.onPauseRequest?.();
    if (this.paused || !this.riding) {
      clearPressed();
      return;
    }
    pollControls(dt, { autoThrottle: settings.autoThrottle, tilt: settings.tiltSteer });
    if (controls.pressed.horn) events.emit("horn", {});

    const env = { world: this.index, stats: this.stats, wetness: this.wetness, fuelUse: this.fuelUse };
    this.bike.update(dt, controls, env);
    const s = this.bike.state;
    this.model.update(s, dt);
    this.chase.update(camera, s, dt, this.index, settings.cameraView, controls.boost && s.boost > 0.02);

    // Stream the city ahead of the rider.
    streamFocus.x = s.x - Math.sin(s.heading) * Math.min(60, s.speed * 3);
    streamFocus.z = s.z - Math.cos(s.heading) * Math.min(60, s.speed * 3);

    hud.speedKmh = Math.abs(s.speed) * 3.6;
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
    this.saveRide();
    this.detach?.();
    this.unsubPlayer();
    this.offEvents.forEach((off) => off());
    this.model.dispose();
  }
}
