/**
 * Local radio: three fictional stations, each with its own procedural sound
 * (Singeli, Bongo flava, Taarab), and DJ breaks between songs: station
 * idents, traffic and weather news from the live game, fuel prices, police
 * warnings, the evening hesabu reminder, shout-outs and ads for the city's
 * businesses. Breaks are text on the HUD and play a recording when the
 * voice bank has one (keys under "radio.").
 */
import type { CityId } from "@/data/cities/config";
import { CITIES } from "@/data/cities/config";
import { FUEL_PRICE, HESABU_HOUR } from "@/data/prices";
import { events } from "@/game/core/events";
import { clockText, env } from "@/game/systems/environment";
import { currentAds } from "@/game/world/adAtlas";
import { currentDictionary, fmt, formatTzs } from "@/i18n";
import { useSettings } from "@/stores/settings";
import { audio, type MusicStyle } from "./AudioEngine";
import { liveStations } from "./LiveRadio";
import { stationDial } from "./stations";
import { playVoice } from "./voices";

export type StationId = "kijiweni" | "bongo" | "pwani";

export const STATIONS: { id: StationId; name: string; freq: string; style: MusicStyle; color: string }[] = [
  { id: "kijiweni", name: "Kijiweni FM", freq: "88.5", style: "singeli", color: "#FFC72C" },
  { id: "bongo", name: "Bongo Vibes", freq: "94.2", style: "bongo", color: "#E0457B" },
  { id: "pwani", name: "Pwani Taarab", freq: "101.7", style: "taarab", color: "#00A3DD" },
];

/** What the radio is saying right now (HUD ticker). */
export const radioHud = { text: "", station: "" as StationId | "", shownAt: 0 };

const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;

export class Radio {
  private untilBreak = 18;
  private segment = 0;
  private eveningDone = -1;

  constructor(
    private readonly city: CityId,
    /** Busy places for traffic reports. */
    private readonly hotspots: string[],
  ) {}

  /** Next live station (or off), as the HUD button and the R key do. */
  static cycle() {
    const ids = liveStations.map((st) => st.id);
    if (!ids.length) return;
    const s = useSettings.getState();
    const order = stationDial(ids);
    const at = order.indexOf(s.radio);
    s.set("radio", order[(at + 1) % order.length]!);
  }

  update(dt: number) {
    const id = useSettings.getState().radio;
    const info = STATIONS.find((s) => s.id === id);
    // Live stations bring their own DJs.
    if (!info || useSettings.getState().musicVolume <= 0) return;
    const station = info.id;
    audio.setStyle(info.style);

    // The evening reminder goes out once, half an hour before the owners collect.
    const day = Math.floor(Date.now() / 600_000);
    if (env.hour > HESABU_HOUR - 0.6 && env.hour < HESABU_HOUR && this.eveningDone !== day) {
      this.eveningDone = day;
      return this.announce(station, "radio.evening", pick(currentDictionary().radio.evening));
    }

    this.untilBreak -= dt;
    if (this.untilBreak > 0) return;
    this.untilBreak = 50 + Math.random() * 35;
    const t = currentDictionary();
    const vars = {
      city: CITIES[this.city].name,
      time: clockText(),
      place: this.hotspots.length ? pick(this.hotspots) : CITIES[this.city].name,
      weather: (env.night > 0.5 && env.weather === "sunny" ? t.life.night : t.life.weather[env.weather]).toLowerCase(),
      fuel: formatTzs(FUEL_PRICE[this.city]),
    };
    const kind = ["dj", "ad", "news", "ad", "shout"][this.segment++ % 5]!;
    if (kind === "dj") return this.announce(station, `radio.${station}.dj`, fmt(pick(t.radio.dj[station]), vars));
    if (kind === "news") return this.announce(station, "radio.news", fmt(pick(t.radio.news), vars));
    if (kind === "shout") return this.announce(station, "radio.shout", fmt(pick(t.radio.shout), vars));
    const ad = currentAds.length ? pick(currentAds) : null;
    if (!ad) return;
    const english = useSettings.getState().locale === "en";
    this.announce(station, `radio.ad.${ad.id}`, fmt(pick(t.radio.ad), { name: ad.name, tagline: english ? ad.taglineEn : ad.tagline }), "radio.ad");
  }

  private announce(station: StationId, key: string, text: string, fallbackKey?: string) {
    radioHud.text = text;
    radioHud.station = station;
    radioHud.shownAt = performance.now();
    events.emit("radio", { station, text });
    const name = STATIONS.find((s) => s.id === station)!.name;
    void playVoice(key, name).then((played) => {
      if (!played && fallbackKey) void playVoice(fallbackKey, name);
    });
  }
}
