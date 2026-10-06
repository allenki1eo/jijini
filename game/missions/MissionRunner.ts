/**
 * Runs the active mission: stop arrivals, the clock, passenger mood, chai
 * spill, combos and the final score + payout. Also keeps the route fresh.
 */
import { events } from "@/game/core/events";
import { env } from "@/game/systems/environment";
import type { NavNetwork } from "@/game/traffic/NavNetwork";
import type { BikeModel } from "@/game/vehicles/BikeModel";
import type { BikeState } from "@/game/vehicles/BikePhysics";
import { usePlayer } from "@/stores/player";
import { useMissions } from "@/stores/missions";
import type { RouteGuide } from "./RouteGuide";
import type { MissionDef, MissionResult, MissionType } from "./types";

const STOP_RADIUS = 11;
const CHECKPOINT_RADIUS = 13;
const STOP_SPEED = 2.6;
const LOAD_TIME = 1.2;
const LATE_GRACE = 60;

/** Per-frame mission values for the HUD and minimap. */
export const missionHud = {
  active: false,
  type: "abiria" as MissionType,
  stopIndex: 0,
  totalStops: 0,
  targetX: 0,
  targetZ: 0,
  distance: 0,
  timeLeft: 0,
  limit: 0 as number | null,
  mood: 1,
  spill: 0,
  loading: 0,
  stopKind: "pickup" as MissionDef["stops"][number]["kind"],
  stopName: "",
  stopPoi: "" as string,
  route: null as Float32Array | null,
  late: false,
  carrying: false,
};

export class MissionRunner {
  private def: MissionDef | null = null;
  private elapsed = 0;
  private mood = 1;
  private spill = 0;
  private loading = 0;
  private collisions = 0;
  private pedHits = 0;
  private nearMisses = 0;
  private maxCombo = 0;
  private photos = 0;
  private hornUses = 0;
  private legsOnTime = 0;
  private sinceRoute = 0;
  private offs: (() => void)[];

  constructor(
    private readonly nav: NavNetwork,
    private readonly model: BikeModel,
    private readonly guide: RouteGuide,
    private readonly cityId: string,
  ) {
    this.offs = [
      events.on("collision", ({ kind }) => {
        if (!this.def) return;
        this.collisions++;
        if (kind === "pedestrian") this.pedHits++;
        this.mood = Math.max(0, this.mood - 0.22);
        if (missionHud.carrying && this.def.type === "chai") this.spill += 0.28;
      }),
      events.on("nearMiss", ({ combo }) => {
        if (!this.def) return;
        this.nearMisses++;
        this.maxCombo = Math.max(this.maxCombo, combo);
        // Passengers don't love near misses.
        if (missionHud.carrying && this.def.passenger !== "none") this.mood = Math.max(0, this.mood - 0.04);
      }),
      events.on("horn", () => this.def && this.hornUses++),
    ];
  }

  get active() {
    return this.def;
  }

  start(def: MissionDef, bike: BikeState) {
    this.def = def;
    this.elapsed = 0;
    this.mood = 1;
    this.spill = 0;
    this.loading = 0;
    this.collisions = 0;
    this.pedHits = 0;
    this.nearMisses = 0;
    this.maxCombo = 0;
    this.photos = 0;
    this.hornUses = 0;
    this.legsOnTime = 0;
    missionHud.active = true;
    missionHud.type = def.type;
    missionHud.stopIndex = 0;
    missionHud.totalStops = def.stops.length;
    missionHud.limit = def.timeLimit;
    missionHud.carrying = false;
    missionHud.late = false;
    this.model.setPassenger("none");
    this.model.setCargo("none");
    useMissions.getState().set({ active: def, result: null, boardOpen: false });
    this.focusStop(bike);
  }

  private focusStop(bike: BikeState) {
    const stop = this.def!.stops[missionHud.stopIndex]!;
    missionHud.targetX = stop.x;
    missionHud.targetZ = stop.z;
    missionHud.stopKind = stop.kind;
    missionHud.stopName = stop.name;
    missionHud.stopPoi = stop.poi ?? "";
    this.guide.setStop(stop);
    this.reroute(bike);
  }

  /** Route from the rider to the current stop over the lane network. */
  private reroute(bike: BikeState) {
    const nav = this.nav;
    const from = nav.nearestOnNetwork(bike.x, bike.z);
    const lane = nav.lanes[from.lane]!;
    const target = nav.nearestNode(missionHud.targetX, missionHud.targetZ);
    // Try leaving via either end of the current road and keep the shorter route.
    const candidates = [lane.to, lane.from].map((node) => {
      const lanes = nav.route(node, target) ?? [];
      const toNode = Math.hypot(nav.nodeX(node) - bike.x, nav.nodeZ(node) - bike.z);
      return { node, lanes, cost: toNode + lanes.reduce((sum, id) => sum + nav.lanes[id]!.length, 0) };
    });
    const best = candidates[0]!.cost <= candidates[1]!.cost ? candidates[0]! : candidates[1]!;
    const pts: number[] = [bike.x, bike.z, from.x, from.z, nav.nodeX(best.node), nav.nodeZ(best.node)];
    for (const id of best.lanes) {
      const l = nav.lanes[id]!;
      for (let i = 2; i < l.pts.length; i += 2) pts.push(l.pts[i]!, l.pts[i + 1]!);
    }
    pts.push(missionHud.targetX, missionHud.targetZ);
    missionHud.route = new Float32Array(pts);
    this.sinceRoute = 0;
  }

  private offRoute(bike: BikeState) {
    const r = missionHud.route;
    if (!r) return true;
    let best = Infinity;
    for (let i = 0; i < r.length; i += 2) best = Math.min(best, (r[i]! - bike.x) ** 2 + (r[i + 1]! - bike.z) ** 2);
    return best > 22 * 22;
  }

  update(dt: number, bike: BikeState) {
    const def = this.def;
    this.guide.update(dt, def ? missionHud.route : null, bike.x, bike.z, this.loading);
    if (!def) return;
    this.elapsed += dt;
    const stop = def.stops[missionHud.stopIndex]!;
    const d = Math.hypot(stop.x - bike.x, stop.z - bike.z);
    missionHud.distance = d;
    missionHud.timeLeft = def.timeLimit !== null ? def.timeLimit - this.elapsed : 0;
    missionHud.late = def.timeLimit !== null && missionHud.timeLeft < 0;

    // Comfort and cargo.
    if (missionHud.carrying) {
      const lat = Math.abs(bike.lateralG);
      const lon = Math.abs(bike.longitudinalG);
      if (def.passenger !== "none") {
        const harsh = Math.max(0, lat - 0.45) * 1.2 + Math.max(0, lon - 0.55) * 0.8 + (bike.surface === "earth" ? 0.08 : 0);
        this.mood = Math.min(1, Math.max(0, this.mood - harsh * dt * 0.6 + (harsh === 0 ? dt * 0.008 : 0)));
      }
      if (def.type === "chai") {
        const slosh = Math.max(0, lat - 0.3) * 0.9 + Math.max(0, lon - 0.35) * 0.8 + (bike.surface === "earth" || bike.surface === "mud" ? 0.12 : 0) + (bike.pitch > 0.2 ? 0.6 : 0);
        this.spill = Math.min(1, this.spill + slosh * dt * 0.55);
        if (this.spill >= 1) return this.finish(false, "spilled");
      }
    }
    missionHud.mood = this.mood;
    missionHud.spill = this.spill;

    // Out of time.
    if (def.timeLimit !== null) {
      const strict = def.type === "dharura" || def.type === "mbio";
      if ((strict && missionHud.timeLeft < 0) || missionHud.timeLeft < -LATE_GRACE) return this.finish(false, "timeout");
    }

    // Arrivals.
    if (stop.kind === "checkpoint") {
      if (d < CHECKPOINT_RADIUS) this.advance(bike);
    } else {
      const radius = stop.kind === "photo" ? STOP_RADIUS + 3 : STOP_RADIUS;
      if (d < radius && Math.abs(bike.speed) < STOP_SPEED) {
        this.loading += dt / (stop.kind === "photo" ? 0.9 : LOAD_TIME);
        if (this.loading >= 1) this.advance(bike);
      } else this.loading = Math.max(0, this.loading - dt * 2);
    }
    missionHud.loading = this.loading;

    this.sinceRoute += dt;
    if (this.sinceRoute > 1.5 && this.offRoute(bike)) this.reroute(bike);
  }

  private advance(bike: BikeState) {
    const def = this.def!;
    const stop = def.stops[missionHud.stopIndex]!;
    this.loading = 0;
    if (stop.kind === "pickup") {
      missionHud.carrying = true;
      if (def.passenger !== "none") this.model.setPassenger(def.passenger);
      else this.model.setCargo(def.cargo);
    } else if (stop.kind === "dropoff") {
      if (def.type === "chipsi" && (def.timeLimit === null || !missionHud.late)) this.legsOnTime++;
      const more = def.stops.slice(missionHud.stopIndex + 1).some((s) => s.kind === "pickup");
      if (more) {
        missionHud.carrying = false;
        this.model.setCargo("none");
      }
    } else if (stop.kind === "photo") {
      this.photos++;
      events.emit("photo", { id: `${stop.name}` });
    }
    if (missionHud.stopIndex + 1 >= def.stops.length) return this.finish(true);
    missionHud.stopIndex++;
    this.focusStop(bike);
  }

  /** Give up the current job (no pay, a small reputation dent). */
  abandon() {
    if (this.def) this.finish(false, "abandoned");
  }

  private finish(success: boolean, reason?: MissionResult["reason"]) {
    const def = this.def!;
    const late = missionHud.late;
    const passengerish = def.passenger !== "none";
    const fare = success ? Math.round(def.fare * (late ? 0.5 : 1)) : 0;
    let tip = 0;
    if (success) {
      if (passengerish) tip += def.fare * 0.35 * this.mood;
      if (def.type === "chai") tip += def.fare * 0.4 * (1 - this.spill);
      if (def.type === "dharura" && def.timeLimit) tip += def.fare * 0.3 * Math.max(0, missionHud.timeLeft / def.timeLimit);
      if (def.type === "wageni") tip += this.photos * 1000;
    }
    const comboMul = def.type === "chipsi" ? 0.25 * Math.max(0, this.legsOnTime - 1) : 0;
    const combo = success ? Math.round(this.nearMisses * 120 + this.maxCombo * 80 + def.fare * comboMul) : 0;
    const clean = success && this.collisions === 0 ? Math.round(def.fare * 0.15 + (passengerish && this.hornUses === 0 ? 200 : 0)) : 0;
    const penalty = Math.round((this.collisions - this.pedHits) * 250 + this.pedHits * 600);
    const total = Math.max(0, Math.round(fare + tip + combo + clean - penalty));
    let stars = 0;
    if (success) {
      stars = 5 - this.collisions * 0.6 - (late ? 1 : 0) - (passengerish ? (1 - this.mood) * 2 : 0) - this.spill * 2;
      stars = Math.max(1, Math.min(5, Math.round(stars)));
    }
    const result: MissionResult = {
      missionId: def.id,
      type: def.type,
      success,
      reason,
      fare,
      tip: Math.round(tip),
      combo,
      clean,
      penalty: success ? penalty : 0,
      total: success ? total : 0,
      stars,
      xp: Math.round(def.xp * (success ? stars / 4 : 0.15)),
      seconds: Math.round(this.elapsed),
      collisions: this.collisions,
      nearMisses: this.nearMisses,
    };

    // Payout and bookkeeping.
    const player = usePlayer.getState();
    player.earn(result.total, result.xp);
    player.adjustReputation(success ? (stars - 3) * 0.06 : reason === "abandoned" ? -0.1 : -0.15);
    if (success) {
      player.patch({ cityEarnings: { ...player.cityEarnings, [this.cityId]: (player.cityEarnings[this.cityId] ?? 0) + result.total } });
      player.bumpStat("deliveries", 1);
      if (this.collisions === 0) player.bumpStat("cleanDeliveries", 1);
      if (stars === 5) player.bumpStat("fiveStars", 1);
      if (env.rain > 0.4) player.bumpStat("rainDeliveries", 1);
      if (env.night > 0.5) player.bumpStat("nightDeliveries", 1);
      if (def.type === "dharura") player.bumpStat("emergencies", 1);
      player.bumpStat("photos", this.photos);
      events.emit("delivery", {
        type: def.type,
        stars,
        earned: result.total,
        clean: this.collisions === 0,
        rain: env.rain > 0.4,
        night: env.night > 0.5,
        seconds: result.seconds,
        city: this.cityId,
      });
    } else events.emit("missionFailed", { type: def.type });

    this.def = null;
    missionHud.active = false;
    missionHud.route = null;
    missionHud.carrying = false;
    this.guide.setStop(null);
    this.model.setPassenger("none");
    this.model.setCargo("none");
    useMissions.getState().set({ active: null, result });
  }

  dispose() {
    this.offs.forEach((off) => off());
    missionHud.active = false;
    missionHud.route = null;
  }
}
