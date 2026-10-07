/**
 * Runs the active mission: stop arrivals, the clock, passenger mood, chai
 * spill, combos and the final score + payout. Also keeps the route fresh.
 */
import { BARGAIN_TYPES, PERSONALITY, QUOTES, acceptChance, counterOffer } from "@/data/passengers";
import { canHaggle } from "@/data/prices";
import { hud } from "@/game/core/hud";
import { events } from "@/game/core/events";
import { clockText, env } from "@/game/systems/environment";
import { say } from "@/game/systems/speech";
import { currentDictionary, fmt, formatTzs } from "@/i18n";
import { usePhone, type ShopItem } from "@/stores/phone";
import type { NavNetwork } from "@/game/traffic/NavNetwork";
import type { BikeModel } from "@/game/vehicles/BikeModel";
import { GHOST_SAMPLE_EVERY, type GhostRider } from "@/game/vehicles/GhostRider";
import type { BikeState } from "@/game/vehicles/BikePhysics";
import { BODAPESA_FARE_SHARE } from "@/data/banks";
import { fareByBodaPesa } from "@/game/systems/money";
import { usePlayer } from "@/stores/player";
import { useMissions } from "@/stores/missions";
import type * as THREE from "three";
import { BusChase } from "./BusChase";
import type { RouteGuide } from "./RouteGuide";
import type { MissionDef, MissionResult, MissionType } from "./types";

const STOP_RADIUS = 11;
const CHECKPOINT_RADIUS = 13;
const STOP_SPEED = 2.6;
const LOAD_TIME = 1.2;
const LATE_GRACE = 60;
/** Haraka passengers start complaining below this speed (m/s). */
const HURRY_SPEED = 5.5;
/** Seconds between a passenger's remarks. */
const CHATTER_GAP = 9;
/** Seconds between the rider's own remarks. */
const TALK_GAP = 6;

export type TalkOption = "hello" | "sorry" | "hold" | "near";

/** A tourist on any ride asks to stop for a picture at a landmark this close (m). */
const SIGHT_RANGE = 45;

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
  /** Races only start the clock at the start line. */
  private raceStarted = false;
  private recording: number[] = [];
  private sinceSample = 0;
  /** Errands: amount paid at the counter, and whether haggling worked. */
  private paid = 0;
  private haggled: boolean | null = null;
  private shopOpen = false;
  private sinceChatter = CHATTER_GAP;
  private sinceTalk = TALK_GAP;
  /** Wahi Basi: the bus being chased. */
  private bus: BusChase | null = null;
  private sinceBusRoute = 0;
  private sincePromo = 0;
  /** "Hold on tight" softens harsh riding for a few seconds. */
  private braced = 0;
  /** The fare agreed at the kerb (starts at the going rate). */
  private agreedFare = 0;
  /** Waiting on the rider's price ("Bei gani?") before the passenger gets on. */
  private bargaining = false;
  private bargained = false;
  /** Seconds a passenger in a rush has been kept crawling. */
  private dawdle = 0;
  /** Shortcut tips: the planned length of the ride leg and the odometer when it began. */
  private legPlanned = 0;
  private legStart = 0;
  private odometer = 0;
  /** Landmarks tourists want pictures of, and the one they've asked about. */
  private sights: { x: number; z: number; name: string }[] = [];
  private sightAsked: { x: number; z: number; name: string } | null = null;
  private sightsDone = new Set<string>();
  private sightHold = 0;
  private extraPhotos = 0;

  constructor(
    private readonly nav: NavNetwork,
    private readonly model: BikeModel,
    private readonly guide: RouteGuide,
    private readonly cityId: string,
    private readonly ghost: GhostRider,
    private readonly scene: THREE.Group,
  ) {
    this.offs = [
      events.on("collision", ({ kind }) => {
        if (!this.def) return;
        this.collisions++;
        if (kind === "pedestrian") this.pedHits++;
        this.mood = Math.max(0, this.mood - 0.22);
        if (missionHud.carrying && this.def.type === "chai") this.spill += 0.28;
        if (missionHud.carrying && this.def.passenger !== "none") this.chatter("crash");
      }),
      events.on("nearMiss", ({ combo }) => {
        if (!this.def) return;
        this.nearMisses++;
        this.maxCombo = Math.max(this.maxCombo, combo);
        // Passengers don't love near misses.
        if (missionHud.carrying && this.def.passenger !== "none") {
          this.mood = Math.max(0, this.mood - 0.04);
          this.chatter("scared");
        }
      }),
      events.on("horn", () => this.def && this.hornUses++),
      events.on("pothole", () => {
        if (!this.def || !missionHud.carrying) return;
        if (this.def.passenger !== "none") {
          this.mood = Math.max(0, this.mood - 0.06);
          this.chatter("scared");
        }
        if (this.def.type === "chai") this.spill += 0.15;
      }),
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
    this.raceStarted = false;
    this.recording = [];
    this.paid = 0;
    this.haggled = null;
    this.shopOpen = false;
    this.sinceChatter = CHATTER_GAP;
    this.agreedFare = def.fare;
    this.bargaining = false;
    this.bargained = !BARGAIN_TYPES.has(def.type) || def.passenger === "none";
    this.dawdle = 0;
    this.legPlanned = 0;
    this.sightAsked = null;
    this.sightsDone.clear();
    this.sightHold = 0;
    this.extraPhotos = 0;
    this.ghost.stop();
    this.clearBus();
    this.sincePromo = 6;
    // Promo rides carry the loudspeaker from the start.
    if (def.cargo === "speaker") {
      missionHud.carrying = true;
      this.model.setCargo("speaker");
    }
    // Errands: the customer sends the shopping money to the boda phone first.
    if (def.errand) {
      usePlayer.getState().transfer(def.errand.advance);
      this.pesa(def.client, def.errand.advance);
    }
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

  /** Landmarks a tourist passenger may want to stop at. */
  setSights(sights: { x: number; z: number; name: string }[]) {
    this.sights = sights;
  }

  update(dt: number, bike: BikeState) {
    const def = this.def;
    this.guide.update(dt, def ? missionHud.route : null, bike.x, bike.z, this.loading);
    this.odometer = bike.odometer;
    if (!def) return;
    const racing = def.type === "mbio";
    if (!racing || this.raceStarted) this.elapsed += dt;
    if (racing && this.raceStarted) {
      this.ghost.update(this.elapsed, dt);
      this.sinceSample += dt;
      if (this.sinceSample >= GHOST_SAMPLE_EVERY) {
        this.sinceSample = 0;
        this.recording.push(+this.elapsed.toFixed(2), +bike.x.toFixed(1), +bike.z.toFixed(1), +bike.heading.toFixed(3));
      }
    }
    const stop = def.stops[missionHud.stopIndex]!;
    // Wahi Basi: the drop-off is wherever the bus is.
    if (this.bus) {
      this.bus.update(dt);
      stop.x = this.bus.x;
      stop.z = this.bus.z;
      missionHud.targetX = stop.x;
      missionHud.targetZ = stop.z;
      this.guide.setStop(stop);
      this.sinceBusRoute += dt;
      if (this.sinceBusRoute > 1.2) {
        this.sinceBusRoute = 0;
        this.reroute(bike);
      }
      if (this.bus.gone) return this.finish(false, "missedBus");
      if (!this.bus.stopped && Math.hypot(stop.x - bike.x, stop.z - bike.z) < 18) this.bus.pullOver();
    }
    // Promo rides: the loudspeaker calls out every few seconds.
    if (def.promo) {
      this.sincePromo += dt;
      if (this.sincePromo > 13) {
        this.sincePromo = 0;
        say("promo", def.client, { name: def.promo.name, tagline: def.promo.tagline });
      }
    }
    const d = Math.hypot(stop.x - bike.x, stop.z - bike.z);
    missionHud.distance = d;
    missionHud.timeLeft = def.timeLimit !== null ? def.timeLimit - this.elapsed : 0;
    missionHud.late = def.timeLimit !== null && missionHud.timeLeft < 0;

    // Comfort and cargo.
    if (missionHud.carrying) {
      const lat = Math.abs(bike.lateralG);
      const lon = Math.abs(bike.longitudinalG);
      if (def.passenger !== "none") {
        const harsh = (Math.max(0, lat - 0.45) * 1.2 + Math.max(0, lon - 0.55) * 0.8 + (bike.surface === "earth" ? 0.08 : 0)) * (this.braced > 0 ? 0.45 : 1);
        this.mood = Math.min(1, Math.max(0, this.mood - harsh * dt * 0.6 + (harsh === 0 ? dt * 0.008 : 0)));
      }
      if (def.type === "chai") {
        const slosh = Math.max(0, lat - 0.3) * 0.9 + Math.max(0, lon - 0.35) * 0.8 + (bike.surface === "earth" || bike.surface === "mud" ? 0.12 : 0) + (bike.pitch > 0.2 ? 0.6 : 0);
        this.spill = Math.min(1, this.spill + slosh * dt * 0.55);
        if (this.spill >= 1) return this.finish(false, "spilled");
      }
    }
    // Hurry customers lose patience whenever the boda dawdles.
    this.sinceChatter += dt;
    this.sinceTalk += dt;
    this.braced = Math.max(0, this.braced - dt);
    if (def.type === "haraka" && missionHud.carrying && Math.abs(bike.speed) < HURRY_SPEED) {
      this.mood = Math.max(0, this.mood - dt * 0.035);
      this.chatter("hurry");
    }
    if (missionHud.carrying && def.passenger !== "none") this.passengerTalk(dt, bike);
    missionHud.mood = this.mood;
    missionHud.spill = this.spill;

    // Out of time.
    if (def.timeLimit !== null) {
      const strict = def.type === "dharura" || def.type === "mbio";
      if ((strict && missionHud.timeLeft < 0) || missionHud.timeLeft < -LATE_GRACE) return this.finish(false, "timeout");
    }

    // Agreeing the fare: the passenger waits at the kerb; ride off and they wave the next boda over.
    if (this.bargaining) {
      if (d > STOP_RADIUS + 25) this.endBargain();
      missionHud.loading = 0;
      return;
    }

    // Arrivals.
    if (stop.kind === "buy" && this.shopOpen) {
      // Riding off closes the counter; come back to finish shopping.
      if (d > STOP_RADIUS + 10) this.closeShop();
      missionHud.loading = 0;
      return;
    }
    if (stop.kind === "checkpoint") {
      if (d < CHECKPOINT_RADIUS) this.advance(bike);
    } else {
      // A passenger will run a little way to a bus that has pulled over.
      const radius = stop.kind === "photo" ? STOP_RADIUS + 3 : this.bus ? 24 : STOP_RADIUS;
      const waitingForBus = this.bus !== null && !this.bus.stopped;
      if (d < radius && Math.abs(bike.speed) < STOP_SPEED && !waitingForBus) {
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
    if (stop.kind === "buy" && !this.paid) return this.openShop(stop.name);
    if (stop.kind === "pickup" && def.type === "mbio") {
      // Green light: the race clock and the ghost of your best run start now.
      this.raceStarted = true;
      this.elapsed = 0;
      this.sinceSample = 0;
      this.recording = [0, +bike.x.toFixed(1), +bike.z.toFixed(1), +bike.heading.toFixed(3)];
      const best = def.courseId ? usePlayer.getState().bests[def.courseId] : undefined;
      if (best) this.ghost.play(best.ghost);
    } else if (stop.kind === "pickup") {
      // "Bei gani?" first: the passenger gets on once a price is agreed.
      if (!this.bargained) return this.openBargain(def, missionHud.stopIndex);
      missionHud.carrying = true;
      if (def.passenger !== "none") {
        this.model.setPassenger(def.passenger);
        say(def.type === "stendi" ? "luggage" : def.type === "haraka" ? "hurry" : def.type === "wahibasi" ? "busAhead" : "greet", def.client);
        this.sinceChatter = 0;
        // The missed bus is already pulling away down the road.
        if (def.busRoute) {
          this.bus = new BusChase(this.nav, def.busRoute);
          this.scene.add(this.bus.group);
          this.sinceBusRoute = 9;
        }
      } else this.model.setCargo(def.cargo);
    } else if (stop.kind === "buy") {
      missionHud.carrying = true;
      this.model.setCargo(def.cargo);
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
    // Shortcut tips: remember how far the planned way to the drop-off is.
    if (stop.kind === "pickup" && def.passenger !== "none") {
      const r = missionHud.route;
      let len = 0;
      if (r) for (let i = 2; i < r.length; i += 2) len += Math.hypot(r[i]! - r[i - 2]!, r[i + 1]! - r[i - 1]!);
      this.legPlanned = len;
      this.legStart = bike.odometer;
    }
  }

  // ── Bargaining ("Bei gani?") ─────────────────────────────────────────────

  private openBargain(def: MissionDef, stopIndex: number) {
    this.bargaining = true;
    const to = def.stops.slice(stopIndex + 1).find((s) => s.kind === "dropoff")?.name ?? "";
    useMissions.getState().set({ bargain: { client: def.client, kind: def.passenger as Exclude<MissionDef["passenger"], "none">, to, fare: def.fare, counter: null } });
    say("bargainAsk", def.client, { place: to || currentDictionary().missions.poi.other });
  }

  private endBargain() {
    this.bargaining = false;
    useMissions.getState().set({ bargain: null });
  }

  /** The passenger climbs on at the agreed price. */
  private agree(amount: number, bike: BikeState) {
    this.agreedFare = amount;
    this.bargained = true;
    this.endBargain();
    this.advance(bike);
  }

  /** Quote QUOTES[i] × the going rate. Returns whether they took it. */
  quote(i: number, bike: BikeState): boolean {
    const def = this.def;
    const b = useMissions.getState().bargain;
    if (!def || !this.bargaining || !b || b.counter !== null) return false;
    const mult = QUOTES[i] ?? 1;
    const amount = Math.round((def.fare * mult) / 100) * 100;
    say("bargainQuote", currentDictionary().ride.you, { amount: formatTzs(amount) });
    const regular = (usePlayer.getState().regulars[def.client] ?? 0) > 0;
    const yes = Math.random() < acceptChance(b.kind, mult, regular);
    window.setTimeout(() => {
      if (this.def !== def) return;
      if (!yes) {
        const counter = counterOffer(b.kind, def.fare, mult);
        useMissions.getState().set({ bargain: { ...b, counter } });
        say(b.kind === "student" ? "bargainBroke" : "bargainCounter", def.client, { amount: formatTzs(counter) });
        return;
      }
      say(mult < 1 ? "bargainThanks" : "bargainOk", def.client);
      const player = usePlayer.getState();
      if (mult < 1) {
        // A fair price gets around the kijiwe.
        player.adjustReputation(0.03);
        this.mood = Math.min(1, this.mood + 0.1);
      } else if (mult > 1.2) {
        // Charging the mzungu price (or anyone else) costs you your good name.
        player.adjustReputation(b.kind === "tourist" ? -0.08 : -0.05);
        events.emit("toast", { text: currentDictionary().bargain.sifaDown, tone: "coral" });
      }
      this.agree(amount, bike);
    }, 700);
    return yes;
  }

  /** Take their counter-offer, or turn it down and let them find another boda. */
  answerCounter(accept: boolean, bike: BikeState) {
    const def = this.def;
    const b = useMissions.getState().bargain;
    if (!def || !this.bargaining || !b || b.counter === null) return;
    if (accept) {
      say("bargainOk", def.client);
      this.agree(b.counter, bike);
      return;
    }
    say("bargainLeave", def.client);
    this.endBargain();
    this.finish(false, "walked");
  }

  // ── Passengers who talk ──────────────────────────────────────────────────

  /** Speed complaints, rushing businessmen, and tourists who want a picture. */
  private passengerTalk(dt: number, bike: BikeState) {
    const def = this.def!;
    const kind = def.passenger as Exclude<MissionDef["passenger"], "none">;
    const p = PERSONALITY[kind];
    const kmh = Math.abs(bike.speed) * 3.6;
    // "Pole pole dereva!": past their comfort over the limit.
    if (kmh > hud.limitKmh + p.speedTolerance && def.type !== "haraka" && def.type !== "wahibasi") {
      this.mood = Math.max(0, this.mood - dt * 0.04 * (this.braced > 0 ? 0.5 : 1));
      this.chatter("slowDown");
    }
    // The businessman is always late.
    if (p.wantsSpeed && def.type !== "haraka") {
      this.dawdle = Math.abs(bike.speed) < HURRY_SPEED ? this.dawdle + dt : Math.max(0, this.dawdle - dt * 2);
      if (this.dawdle > 6) {
        this.mood = Math.max(0, this.mood - dt * 0.02);
        this.chatter("late");
      }
    }
    // A tourist spots a landmark: stop close by for a moment and they take a picture (and tip for it).
    if (kind === "tourist" && def.type !== "wageni") {
      if (!this.sightAsked) {
        const near = this.sights.find((s) => !this.sightsDone.has(s.name) && Math.hypot(s.x - bike.x, s.z - bike.z) < SIGHT_RANGE);
        if (near) {
          this.sightAsked = near;
          this.sightHold = 0;
          say("touristSight", def.client, { place: near.name });
          this.sinceChatter = 0;
        }
      } else {
        const s = this.sightAsked;
        const d = Math.hypot(s.x - bike.x, s.z - bike.z);
        if (d > SIGHT_RANGE * 2.5) {
          this.sightsDone.add(s.name);
          this.sightAsked = null;
        } else if (d < SIGHT_RANGE && Math.abs(bike.speed) < STOP_SPEED) {
          this.sightHold += dt;
          if (this.sightHold > 1.5) {
            this.sightsDone.add(s.name);
            this.sightAsked = null;
            this.extraPhotos++;
            this.mood = Math.min(1, this.mood + 0.15);
            events.emit("photo", { id: s.name });
            say("touristPhoto", def.client);
          }
        }
      }
    }
  }

  private clearBus() {
    if (!this.bus) return;
    this.scene.remove(this.bus.group);
    this.bus.dispose();
    this.bus = null;
  }

  /** True when there's a passenger on board to talk to. */
  get canTalk() {
    return Boolean(this.def && missionHud.carrying && this.def.passenger !== "none" && this.sinceTalk >= TALK_GAP);
  }

  /**
   * Talk to the passenger. Small talk and apologies lift the mood a little,
   * "hold on" softens rough riding for a while, and "almost there" only
   * pleases when it's true.
   */
  talk(option: TalkOption) {
    const def = this.def;
    if (!def || !this.canTalk) return;
    this.sinceTalk = 0;
    const lines = currentDictionary().phone.chatOptions;
    events.emit("say", { key: `rider.${option}`, who: currentDictionary().ride.you, text: lines[option] });
    let delta = 0;
    if (option === "hello") delta = this.mood > 0.3 ? 0.05 : 0.01;
    else if (option === "sorry") delta = this.mood < 0.75 ? 0.1 : 0.02;
    else if (option === "hold") {
      this.braced = 10;
      delta = 0.02;
    } else delta = missionHud.distance < 220 ? 0.07 : -0.06;
    this.mood = Math.min(1, Math.max(0, this.mood + delta));
    const reply = { hello: "chatHello", sorry: "chatSorry", hold: "chatHold", near: delta > 0 ? "chatNear" : "hurry" } as const;
    window.setTimeout(() => this.def === def && say(reply[option], def.client), 900);
    this.sinceChatter = 0;
  }

  /** Something frightening (a police chase): passengers lose their nerve. */
  scare() {
    if (!this.def || !missionHud.carrying || this.def.passenger === "none") return;
    this.mood = Math.max(0, this.mood - 0.004);
    this.chatter("scared");
  }

  /** A passenger remark, at most one every few seconds. */
  private chatter(key: "hurry" | "scared" | "crash" | "slowDown" | "late") {
    if (this.sinceChatter < CHATTER_GAP || !this.def) return;
    this.sinceChatter = 0;
    say(key, this.def.client);
  }

  /** A mobile-money alert on the boda phone (+ received, − sent). */
  private pesa(who: string, amount: number) {
    const t = currentDictionary().phone;
    usePhone.getState().push({
      from: t.pesaName,
      kind: "pesa",
      amount,
      at: clockText(),
      text: fmt(amount >= 0 ? t.pesaIn : t.pesaOut, { amount: formatTzs(Math.abs(amount)), who }),
    });
    events.emit("sms", { from: t.pesaName });
  }

  /** Arrived at the shop: stall prices vary a little from what the customer expected. */
  private openShop(place: string) {
    const def = this.def!;
    const errand = def.errand!;
    this.shopOpen = true;
    const seed = def.id.length * 31 + missionHud.stopIndex;
    const items: ShopItem[] = errand.items.map((item, i) => {
      const wobble = 0.95 + (((seed * (i + 3) * 7919) % 100) / 100) * 0.14;
      return { id: item.id, qty: item.qty, unit: Math.max(50, Math.round((item.unit * wobble) / 50) * 50), expected: item.unit };
    });
    usePhone.getState().set({
      shop: { place, seller: errand.seller, items, advance: errand.advance, haggled: this.haggled, canHaggle: canHaggle(errand.seller) },
    });
    say("seller", place || currentDictionary().missions.poi.market);
  }

  private closeShop() {
    this.shopOpen = false;
    usePhone.getState().set({ shop: null });
  }

  /** Ask for a better price, once per errand. Market stalls often agree; good reputation helps. */
  haggle(): boolean {
    const shop = usePhone.getState().shop;
    if (!shop || !shop.canHaggle || shop.haggled !== null) return false;
    say("haggleAsk", currentDictionary().ride.you);
    const rep = usePlayer.getState().reputation;
    const ok = Math.random() < 0.45 + rep * 0.06;
    this.haggled = ok;
    const items = ok ? shop.items.map((i) => ({ ...i, unit: Math.max(50, Math.round((i.unit * (0.86 + Math.random() * 0.06)) / 50) * 50) })) : shop.items;
    usePhone.getState().set({ shop: { ...shop, items, haggled: ok } });
    window.setTimeout(() => say(ok ? "haggleYes" : "haggleNo", shop.place || currentDictionary().missions.poi.market), 700);
    return ok;
  }

  /** Pay at the counter and load the shopping. False when the wallet can't cover it. */
  purchase(bike: BikeState): boolean {
    const shop = usePhone.getState().shop;
    if (!shop || !this.def) return false;
    const total = shop.items.reduce((sum, i) => sum + i.qty * i.unit, 0);
    if (!usePlayer.getState().spend(total)) return false;
    this.paid = total;
    this.closeShop();
    events.emit("refuel", { liters: 0, cost: total });
    this.advance(bike);
    return true;
  }

  /** Give up the current job (no pay, a small reputation dent). */
  abandon() {
    if (this.def) this.finish(false, "abandoned");
  }

  private finish(success: boolean, reason?: MissionResult["reason"]) {
    const def = this.def!;
    const late = missionHud.late;
    const passengerish = def.passenger !== "none";
    const fare = success ? Math.round(this.agreedFare * (late ? 0.5 : 1)) : 0;
    let tip = 0;
    let shortcut = false;
    if (success) {
      // Tourists tip for pictures taken on the way.
      tip += this.extraPhotos * 1000;
      // Knowing a short cut: the passenger rode noticeably less than the planned way, and on time.
      const ridden = this.odometer - this.legStart;
      if (passengerish && this.legPlanned > 300 && ridden > 50 && ridden < this.legPlanned * 0.85 && !late) {
        shortcut = true;
        tip += Math.max(500, this.agreedFare * 0.25);
      }
      if (passengerish) tip += def.fare * 0.35 * this.mood;
      if (def.type === "chai") tip += def.fare * 0.4 * (1 - this.spill);
      if (def.type === "dharura" && def.timeLimit) tip += def.fare * 0.3 * Math.max(0, missionHud.timeLeft / def.timeLimit);
      if (def.type === "wageni") tip += this.photos * 1000;
      // Hurry customers pay for every second saved.
      if (def.type === "haraka" && def.timeLimit) tip += def.fare * 0.6 * Math.max(0, missionHud.timeLeft / def.timeLimit);
    }
    // Errands: hand back the change (or get topped up when prices were higher). Honesty earns a tip.
    let shopping: MissionResult["shopping"];
    if (def.errand) {
      const expected = def.errand.items.reduce((sum, i) => sum + i.qty * i.unit, 0);
      const change = this.paid ? def.errand.advance - this.paid : def.errand.advance;
      shopping = { paid: this.paid, change, haggled: this.haggled === true };
      if (success) {
        const saved = Math.max(0, expected - this.paid);
        tip += 300 + Math.min(2500, saved * 0.5);
      }
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
      shopping,
      shortcut,
    };

    // Races: personal bests and ghosts.
    const player = usePlayer.getState();
    this.ghost.stop();
    if (def.courseId) {
      const prev = player.bests[def.courseId];
      result.best = prev?.time;
      if (success && (!prev || this.elapsed < prev.time)) {
        result.record = true;
        result.best = +this.elapsed.toFixed(2);
        player.patch({ bests: { ...player.bests, [def.courseId]: { time: result.best, ghost: this.recording } } });
      }
      if (success) events.emit("raceFinished", { courseId: def.courseId, seconds: +this.elapsed.toFixed(2) });
    }

    // Payout and bookkeeping.
    player.earn(result.total, result.xp);
    // About a third of customers pay by BodaPesa rather than cash.
    if (success && result.total > 0 && def.type !== "mbio" && Math.random() < BODAPESA_FARE_SHARE) fareByBodaPesa(result.total, def.client);
    if (shopping && shopping.change !== 0) {
      player.transfer(-shopping.change);
      this.pesa(def.client, -shopping.change);
      if (success) say(shopping.change > 0 ? "change" : "topup", def.client);
    }
    if (success && def.passenger !== "none" && def.type !== "mbio") say(shortcut ? "shortcut" : def.type === "wahibasi" ? "busCaught" : "thanks", def.client);
    this.clearBus();
    // Happy customers save your number and call again.
    if (success && stars >= 4 && def.type !== "mbio" && def.type !== "wageni") {
      const regulars = usePlayer.getState().regulars;
      player.patch({ regulars: { ...regulars, [def.client]: (regulars[def.client] ?? 0) + 1 } });
    }
    // Turning down a stingy passenger costs nothing; giving up on a job does.
    player.adjustReputation(success ? (stars - 3) * 0.06 : reason === "walked" ? 0 : reason === "abandoned" ? -0.1 : -0.15);
    if (success) {
      player.patch({ cityEarnings: { ...player.cityEarnings, [this.cityId]: (player.cityEarnings[this.cityId] ?? 0) + result.total } });
      player.bumpStat("deliveries", 1);
      if (this.collisions === 0) player.bumpStat("cleanDeliveries", 1);
      if (stars === 5) player.bumpStat("fiveStars", 1);
      if (env.rain > 0.4) player.bumpStat("rainDeliveries", 1);
      if (env.night > 0.5) player.bumpStat("nightDeliveries", 1);
      if (def.type === "dharura") player.bumpStat("emergencies", 1);
      player.bumpStat("photos", this.photos + this.extraPhotos);
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

    this.closeShop();
    this.endBargain();
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
    this.clearBus();
    this.offs.forEach((off) => off());
    missionHud.active = false;
    missionHud.route = null;
  }
}
