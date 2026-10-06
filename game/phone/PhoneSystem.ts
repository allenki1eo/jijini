/**
 * The boda phone's brain: customers call with jobs (pickups, shopping
 * errands, hurry rides, travellers at the bus stand), regulars call more
 * often, waiting customers text when you're slow, and you can ring your
 * regulars to ask for work.
 */
import { events } from "@/game/core/events";
import { missionHud } from "@/game/missions/MissionRunner";
import { CLIENTS, type MissionDef, type MissionType } from "@/game/missions/types";
import { clockText } from "@/game/systems/environment";
import { line } from "@/game/systems/speech";
import { currentDictionary, fmt } from "@/i18n";
import { useMissions } from "@/stores/missions";
import { usePlayer } from "@/stores/player";
import { usePhone } from "@/stores/phone";

/** Jobs that arrive by phone, and how likely each is. */
const PHONE_JOBS: [MissionType, number][] = [
  ["abiria", 0.34],
  ["ninunulie", 0.28],
  ["haraka", 0.2],
  ["stendi", 0.14],
  ["wahibasi", 0.12],
];
const RING_SECONDS = 16;
/** A waiting customer texts after this long. */
const WAIT_TEXT_AFTER = 55;

export interface PhoneHost {
  /** A job of `type` for `client` near the rider, or null. */
  makeJob(type: MissionType, client: string): MissionDef | null;
  accept(def: MissionDef): void;
  /** Mission types the player has unlocked. */
  unlocked(): MissionType[];
  /** False during the tutorial, menus and debug cameras. */
  available(): boolean;
}

export class PhoneSystem {
  private untilCall = 22;
  private waitTexted = false;
  private waitedFor = 0;
  private offs: (() => void)[];

  constructor(private readonly host: PhoneHost) {
    this.offs = [
      events.on("delivery", () => {
        this.waitTexted = false;
        this.waitedFor = 0;
      }),
    ];
  }

  update(dt: number) {
    const phone = usePhone.getState();
    // A ringing call counts down and rings out.
    if (phone.call) {
      const ringsLeft = phone.call.ringsLeft - dt;
      if (ringsLeft <= 0) {
        phone.log({ who: phone.call.caller, at: clockText(), outcome: "missed" });
        this.text(phone.call.caller, line("smsBusy"));
        phone.set({ call: null });
        events.emit("ringing", { on: false });
      } else phone.set({ call: { ...phone.call, ringsLeft } });
      return;
    }

    // A customer waiting for pickup texts when you take too long.
    if (missionHud.active && !missionHud.carrying && missionHud.stopKind === "pickup") {
      this.waitedFor += dt;
      const client = useMissions.getState().active?.client;
      if (client && !this.waitTexted && this.waitedFor > WAIT_TEXT_AFTER) {
        this.waitTexted = true;
        this.text(client, line("smsWhere"));
      }
    } else this.waitedFor = 0;

    if (missionHud.active || !this.host.available()) return;
    this.untilCall -= dt;
    if (this.untilCall > 0) return;
    // Busier phones for riders with a good reputation.
    const rep = usePlayer.getState().reputation;
    this.untilCall = (38 + Math.random() * 50) * (1.25 - rep * 0.08);
    this.ring();
  }

  /** An incoming call with a job; regulars call more often and pay a bit more. */
  ring(caller?: string): boolean {
    const regulars = usePlayer.getState().regulars;
    const names = Object.keys(regulars);
    const regular = caller !== undefined || (names.length > 0 && Math.random() < 0.45);
    const who = caller ?? (regular ? weighted(names, (n) => regulars[n] ?? 1) : CLIENTS[Math.floor(Math.random() * CLIENTS.length)]!);
    const unlocked = this.host.unlocked();
    const jobs = PHONE_JOBS.filter(([t]) => unlocked.includes(t));
    for (let attempt = 0; attempt < 4 && jobs.length; attempt++) {
      const type = weighted(
        jobs.map(([t]) => t),
        (t) => jobs.find(([j]) => j === t)![1],
      );
      const def = this.host.makeJob(type, who);
      if (!def) continue;
      const offer = regular ? { ...def, fare: Math.round((def.fare * 1.15) / 100) * 100 } : def;
      const first = offer.stops[0]!;
      const t = currentDictionary();
      const place = first.name || (first.poi ? (t.missions.poi as Record<string, string>)[first.poi] : "") || t.missions.poi.street;
      const key = regular && type === "abiria" ? "callRegular" : type === "ninunulie" ? "callErrand" : type === "haraka" ? "callHurry" : type === "stendi" ? "callStendi" : type === "wahibasi" ? "callBus" : "callPickup";
      usePhone.getState().set({ call: { id: Date.now(), caller: who, text: line(key, { place }), offer, regular, ringsLeft: RING_SECONDS } });
      events.emit("ringing", { on: true });
      return true;
    }
    return false;
  }

  accept() {
    const phone = usePhone.getState();
    const call = phone.call;
    if (!call) return;
    phone.set({ call: null });
    events.emit("ringing", { on: false });
    phone.log({ who: call.caller, at: clockText(), outcome: "accepted" });
    events.emit("say", { key: "caller", who: call.caller, text: call.text });
    this.waitTexted = false;
    this.waitedFor = 0;
    this.host.accept(call.offer);
  }

  decline() {
    const phone = usePhone.getState();
    if (!phone.call) return;
    phone.log({ who: phone.call.caller, at: clockText(), outcome: "declined" });
    phone.set({ call: null });
    events.emit("ringing", { on: false });
    this.untilCall = Math.max(this.untilCall, 30);
  }

  /** Ring a regular to ask for work. They often have something. */
  callRegular(name: string): "ringing" | "busy" | "noAnswer" {
    const phone = usePhone.getState();
    if (missionHud.active || phone.call) return "busy";
    phone.log({ who: name, at: clockText(), outcome: "outgoing" });
    if (Math.random() < 0.72 && this.ring(name)) return "ringing";
    this.text(name, fmt(currentDictionary().phone.noAnswer, { who: name }));
    return "noAnswer";
  }

  private text(from: string, body: string) {
    usePhone.getState().push({ from, text: body, kind: "sms", at: clockText() });
    events.emit("sms", { from });
  }

  dispose() {
    this.offs.forEach((off) => off());
    if (usePhone.getState().call) events.emit("ringing", { on: false });
    usePhone.getState().set({ call: null, shop: null, open: false });
  }
}

const weighted = <T>(items: T[], weight: (item: T) => number): T => {
  const total = items.reduce((sum, i) => sum + weight(i), 0);
  let roll = Math.random() * total;
  for (const item of items) if ((roll -= weight(item)) <= 0) return item;
  return items[items.length - 1]!;
};
