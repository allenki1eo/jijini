/**
 * The ride's radio dial. Every station is a live Tanzanian stream from
 * public/radio/stations.json (see LiveRadio); there are no built-in stations.
 */
import { useSettings } from "@/stores/settings";
import { liveStations } from "./LiveRadio";
import { nextStation } from "./stations";

/** FM reception the HUD shows (0..1); the ride updates it as you move. */
export const radioHud = { signal: 1 };

export const Radio = {
  /** Next live station, then off, as the radio chip and the R key do. Nothing to flip to without a catalog. */
  cycle() {
    const s = useSettings.getState();
    const next = nextStation(s.radio, liveStations.map((st) => st.id));
    if (next !== s.radio) s.set("radio", next);
  },
};
