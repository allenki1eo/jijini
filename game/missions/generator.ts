/**
 * Mission generator: turns real OpenStreetMap places (shops, hospitals,
 * schools, markets, hotels) into jobs with believable TZS fares.
 */
import { POI_KINDS, type Poi, type PoiKind } from "@/game/world/format";
import type { NavNetwork } from "@/game/traffic/NavNetwork";
import type { CargoKind, PassengerKind } from "@/game/vehicles/BikeModel";
import { CLIENTS, TOURIST_NAMES, type MissionDef, type MissionType, type RiskTag, type Stop } from "./types";

export interface GeneratorContext {
  nav: NavNetwork;
  pois: Poi[];
  x: number;
  z: number;
  /** Mission types the player has unlocked. */
  types: MissionType[];
  hour: number;
  night: boolean;
  rain: boolean;
  /** City difficulty 1..4 scales fares. */
  difficulty: number;
  random?: () => number;
}

interface Place {
  x: number;
  z: number;
  name: string;
  poi?: PoiKind;
}

const PASSENGERS: PassengerKind[] = ["mama", "student", "business", "elder", "kid"];

const roundFare = (v: number) => Math.round(v / 100) * 100;

export class MissionGenerator {
  private places: Place[];
  private counter = 0;

  constructor(private readonly ctxNav: NavNetwork, pois: Poi[]) {
    this.places = pois.map((p) => ({ x: p.x / 10, z: p.z / 10, name: p.n ?? "", poi: POI_KINDS[p.k] }));
  }

  private rand: () => number = Math.random;

  private pick<T>(list: T[]): T | undefined {
    return list[Math.floor(this.rand() * list.length)];
  }

  /** A random point on the road network (for homes, street corners). */
  private streetPoint(cx: number, cz: number, minD: number, maxD: number): Place {
    const lanes = this.ctxNav.lanes;
    for (let i = 0; i < 40; i++) {
      const lane = lanes[Math.floor(this.rand() * lanes.length)]!;
      if (lane.cls >= 5) continue;
      const p = this.ctxNav.sample(lane.id, this.rand() * lane.length, { x: 0, z: 0, dx: 0, dz: 0 });
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d >= minD && d <= maxD) return { x: p.x, z: p.z, name: "" };
    }
    return { x: cx, z: cz, name: "" };
  }

  private place(kinds: PoiKind[] | null, cx: number, cz: number, minD: number, maxD: number): Place {
    const options = this.places.filter((p) => {
      if (kinds && (!p.poi || !kinds.includes(p.poi))) return false;
      const d = Math.hypot(p.x - cx, p.z - cz);
      return d >= minD && d <= maxD;
    });
    return this.pick(options) ?? this.streetPoint(cx, cz, minD, maxD);
  }

  private nearest(kinds: PoiKind[], cx: number, cz: number, minD: number): Place | null {
    let best: Place | null = null;
    let bestD = Infinity;
    for (const p of this.places) {
      if (!p.poi || !kinds.includes(p.poi)) continue;
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d >= minD && d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** Snap a place to the curb of the nearest road so stops are reachable. */
  private stop(p: Place, kind: Stop["kind"]): Stop & { poi?: PoiKind } {
    const n = this.ctxNav.nearestOnNetwork(p.x, p.z);
    return { x: n.x, z: n.z, kind, name: p.name, poi: p.poi };
  }

  private leg(ax: number, az: number, bx: number, bz: number): { length: number; pts: number[] } {
    const nav = this.ctxNav;
    const from = nav.nearestNode(ax, az);
    const to = nav.nearestNode(bx, bz);
    const lanes = nav.route(from, to) ?? [];
    const pts: number[] = [ax, az];
    let length = Math.hypot(nav.nodeX(from) - ax, nav.nodeZ(from) - az);
    for (const id of lanes) {
      const lane = nav.lanes[id]!;
      length += lane.length;
      for (let i = 0; i < lane.pts.length; i += 2) pts.push(lane.pts[i]!, lane.pts[i + 1]!);
    }
    pts.push(bx, bz);
    length += Math.hypot(nav.nodeX(to) - bx, nav.nodeZ(to) - bz);
    return { length: Math.max(length, Math.hypot(bx - ax, bz - az)), pts };
  }

  private build(
    type: MissionType,
    ctx: GeneratorContext,
    stops: Stop[],
    opts: { client: string; passenger?: PassengerKind; cargo?: CargoKind; risks?: RiskTag[]; speed: number; slack: number; base: number; perKm: number },
  ): MissionDef {
    let distance = 0;
    const pts: number[] = [];
    let px = ctx.x, pz = ctx.z;
    let paidDistance = 0;
    stops.forEach((s, i) => {
      const leg = this.leg(px, pz, s.x, s.z);
      distance += leg.length;
      if (i > 0) paidDistance += leg.length;
      pts.push(...leg.pts);
      px = s.x;
      pz = s.z;
    });
    const cityMul = 1 + (ctx.difficulty - 1) * 0.1;
    const weatherMul = ctx.rain ? 1.2 : 1;
    const fare = roundFare((opts.base + (opts.perKm * paidDistance) / 1000) * cityMul * weatherMul);
    const risks = [...(opts.risks ?? [])];
    if (ctx.rain) risks.push("rain");
    if (ctx.night) risks.push("night");
    if (distance > 1600) risks.push("long");
    return {
      id: `${type}-${Date.now().toString(36)}-${this.counter++}`,
      type,
      client: opts.client,
      stops,
      fare,
      xp: Math.round(20 + (paidDistance / 1000) * 35 * (fare / Math.max(1, opts.base + opts.perKm))),
      timeLimit: opts.speed > 0 ? Math.round(distance / opts.speed + opts.slack) : null,
      distance: Math.round(distance),
      passenger: opts.passenger ?? "none",
      cargo: opts.cargo ?? "none",
      risks: [...new Set(risks)],
      preview: normalize(pts),
    };
  }

  private make(type: MissionType, ctx: GeneratorContext): MissionDef | null {
    const { x, z } = ctx;
    const client = this.pick(CLIENTS)!;
    const any = null;
    switch (type) {
      case "abiria":
      case "usiku": {
        const a = this.place(["shop", "market", "bus_station", "bank", "restaurant", "bar", "hotel", "office"], x, z, 30, 380);
        const b = this.place(any, a.x, a.z, 300, 1500);
        return this.build(type, ctx, [this.stop(a, "pickup"), this.stop(b, "dropoff")], {
          client,
          passenger: this.pick(PASSENGERS),
          speed: 7,
          slack: 45,
          base: type === "usiku" ? 2700 : 1500,
          perKm: type === "usiku" ? 6300 : 3500,
          risks: type === "usiku" ? ["night"] : [],
        });
      }
      case "mzigo": {
        const a = this.place(["shop", "market", "office", "bus_station"], x, z, 30, 400);
        const b = this.place(any, a.x, a.z, 300, 1300);
        return this.build(type, ctx, [this.stop(a, "pickup"), this.stop(b, "dropoff")], { client, cargo: "parcel", speed: 8.5, slack: 30, base: 1200, perKm: 3300, risks: ["fast"] });
      }
      case "dharura": {
        const a = this.streetPoint(x, z, 40, 350);
        const h = this.nearest(["hospital", "clinic"], a.x, a.z, 250) ?? this.nearest(["hospital", "clinic", "pharmacy"], a.x, a.z, 0);
        if (!h) return null;
        return this.build(type, ctx, [this.stop(a, "pickup"), this.stop(h, "dropoff")], {
          client,
          passenger: this.pick(["elder", "mama", "kid"] as PassengerKind[]),
          speed: 10,
          slack: 22,
          base: 3300,
          perKm: 7700,
          risks: ["fast", "vip"],
        });
      }
      case "chai": {
        const a = this.place(["restaurant"], x, z, 30, 450);
        const b = this.place(["office", "bank", "shop", "school", "hospital"], a.x, a.z, 250, 950);
        return this.build(type, ctx, [this.stop(a, "pickup"), this.stop(b, "dropoff")], { client, cargo: "chai", speed: 7, slack: 40, base: 1700, perKm: 3900, risks: ["fragile"] });
      }
      case "soko": {
        const a = this.nearest(["market"], x, z, 0) ?? this.place(["shop"], x, z, 30, 500);
        const b = this.place(["shop", "restaurant", "hotel", "bar"], a.x, a.z, 250, 1100);
        return this.build(type, ctx, [this.stop(a, "pickup"), this.stop(b, "dropoff")], { client, cargo: "crates", speed: 7.5, slack: 40, base: 1900, perKm: 4500, risks: ["crowded", "fragile"] });
      }
      case "shule": {
        const school = this.place(["school"], x, z, 200, 1300);
        if (!school.poi) return null;
        const kid1 = this.streetPoint(x, z, 40, 400);
        const kid2 = this.streetPoint(kid1.x, kid1.z, 120, 450);
        return this.build(type, ctx, [this.stop(kid1, "pickup"), this.stop(kid2, "pickup"), this.stop(school, "dropoff")], {
          client,
          passenger: "kid",
          speed: 7.5,
          slack: 70,
          base: 2500,
          perKm: 4400,
          risks: ctx.hour >= 6 && ctx.hour <= 9 ? ["fast"] : [],
        });
      }
      case "wageni": {
        const hotel = this.nearest(["hotel"], x, z, 0) ?? this.place(any, x, z, 30, 400);
        const sights = this.places.filter((p) => p.name && ["place_of_worship", "market", "hospital", "school", "bus_station"].includes(p.poi ?? "") && Math.hypot(p.x - hotel.x, p.z - hotel.z) > 200 && Math.hypot(p.x - hotel.x, p.z - hotel.z) < 900);
        const s1 = this.pick(sights);
        const s2 = this.pick(sights.filter((s) => s !== s1 && s1 && Math.hypot(s.x - s1.x, s.z - s1.z) > 150));
        if (!s1 || !s2) return null;
        return this.build(type, ctx, [this.stop(hotel, "pickup"), this.stop(s1, "photo"), this.stop(s2, "photo"), this.stop(hotel, "dropoff")], {
          client: this.pick(TOURIST_NAMES)!,
          passenger: "tourist",
          speed: 6,
          slack: 90,
          base: 3000,
          perKm: 4800,
          risks: ["vip"],
        });
      }
      case "mbio": {
        const course = this.raceCourse(x, z);
        if (!course) return null;
        return this.build(type, ctx, course, { client: "Baraka", speed: 12.5, slack: 10, base: 6000, perKm: 3000, risks: ["fast"] });
      }
      case "chipsi": {
        const stops: Stop[] = [];
        let cx = x, cz = z;
        for (let i = 0; i < 3; i++) {
          const r = this.place(["restaurant"], cx, cz, i === 0 ? 30 : 0, 500);
          const d = this.place(any, r.x, r.z, 200, 700);
          stops.push(this.stop(r, "pickup"), this.stop(d, "dropoff"));
          cx = d.x;
          cz = d.z;
        }
        return this.build(type, ctx, stops, { client, cargo: "food", speed: 8, slack: 75, base: 4500, perKm: 3600, risks: ["fast"] });
      }
    }
  }

  /** A loop of checkpoints along bigger roads, starting near the player. */
  private raceCourse(x: number, z: number): Stop[] | null {
    const nav = this.ctxNav;
    let node = nav.nearestNode(x, z);
    const points: [number, number][] = [];
    let lane = -1;
    let length = 0;
    for (let i = 0; i < 40 && length < 1700; i++) {
      const out = nav.out[node]!.filter((id) => id !== nav.reverse[lane]);
      if (!out.length) break;
      out.sort((a, b) => nav.lanes[a]!.cls - nav.lanes[b]!.cls);
      lane = this.rand() < 0.7 ? out[0]! : this.pick(out)!;
      const l = nav.lanes[lane]!;
      length += l.length;
      node = l.to;
      points.push([nav.nodeX(node), nav.nodeZ(node)]);
    }
    if (length < 700 || points.length < 4) return null;
    const step = Math.max(1, Math.floor(points.length / 6));
    const picks = points.filter((_, i) => i % step === step - 1 || i === points.length - 1).slice(-6);
    return picks.map(([px, pz], i) => ({ x: px, z: pz, kind: "checkpoint" as const, name: `${i + 1}/${picks.length}` }));
  }

  /** The tutorial's first job: a short, untimed passenger ride close by. */
  tutorial(ctx: GeneratorContext): MissionDef {
    this.rand = ctx.random ?? Math.random;
    const a = this.place(["shop", "market", "bus_station", "restaurant", "bank"], ctx.x, ctx.z, 40, 170);
    const b = this.place(null, a.x, a.z, 220, 480);
    const def = this.build("abiria", ctx, [this.stop(a, "pickup"), this.stop(b, "dropoff")], {
      client: "Mama Neema",
      passenger: "mama",
      speed: 0,
      slack: 0,
      base: 2000,
      perKm: 3500,
    });
    return { ...def, risks: [] };
  }

  /** A fresh board of offers. */
  offers(ctx: GeneratorContext, count = 4): MissionDef[] {
    this.rand = ctx.random ?? Math.random;
    const types = ctx.types.filter((t) => (t === "usiku" ? ctx.night : true));
    const out: MissionDef[] = [];
    // Always at least one passenger ride; the rest is a varied mix.
    const queue: MissionType[] = ["abiria", ...[...types].sort(() => this.rand() - 0.5)];
    for (const type of queue) {
      if (out.length >= count) break;
      if (!types.includes(type) || out.some((m) => m.type === type)) continue;
      const m = this.make(type, ctx);
      if (m) out.push(m);
    }
    while (out.length < count) {
      const m = this.make(this.pick(["abiria", "mzigo"] as MissionType[])!, ctx);
      if (!m) break;
      out.push(m);
    }
    return out;
  }
}

/** Normalize a polyline into a padded unit square, keeping aspect ratio. */
const normalize = (pts: number[]): number[] => {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]!);
    maxX = Math.max(maxX, pts[i]!);
    minZ = Math.min(minZ, pts[i + 1]!);
    maxZ = Math.max(maxZ, pts[i + 1]!);
  }
  const size = Math.max(maxX - minX, maxZ - minZ, 1);
  const ox = (size - (maxX - minX)) / 2, oz = (size - (maxZ - minZ)) / 2;
  const out: number[] = [];
  // Thin the polyline: previews don't need every vertex.
  const stride = Math.max(2, Math.floor(pts.length / 120) * 2);
  for (let i = 0; i < pts.length; i += stride) out.push(+(0.08 + 0.84 * ((pts[i]! - minX + ox) / size)).toFixed(3), +(0.08 + 0.84 * ((pts[i + 1]! - minZ + oz) / size)).toFixed(3));
  out.push(+(0.08 + 0.84 * ((pts[pts.length - 2]! - minX + ox) / size)).toFixed(3), +(0.08 + 0.84 * ((pts[pts.length - 1]! - minZ + oz) / size)).toFixed(3));
  return out;
};
