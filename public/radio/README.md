# Live radio

Besides its three built-in stations (Kijiweni FM, Bongo Vibes, Pwani Taarab), BodaGo can play **real radio stations live**. They appear on the radio button (or the R key) after the built-in ones, marked **LIVE**.

## Adding a station

1. **Get permission from the station.** Playing a broadcaster's stream inside your game is rebroadcasting it. Ask the station in writing; many are happy to be featured, and some will give you an official stream link.
2. Find its **HTTPS** stream URL. Station websites usually have a "Sikiliza mubashara" / "Listen live" player; the stream is the `.mp3`, `.aac` or `.m3u8` address behind it. Plain `http://` streams are blocked on an HTTPS site.
3. Add it to `stations.json` here:

```json
{
  "live": [
    { "name": "Station Name", "freq": "88.4", "url": "https://stream.example.co.tz/live.mp3", "color": "#E60000" }
  ]
}
```

| Field | Notes |
|---|---|
| `name` | Shown on the radio chip and in messages. |
| `freq` | Shown next to the name (any short text). |
| `url` | Must start with `https://`. MP3 and AAC play everywhere; HLS (`.m3u8`) plays on Safari and recent Chrome on Android. |
| `color` | Accent colour for the station. |

## How it behaves

- Live audio follows the music volume. It pauses when the game goes to the background and stops completely (so it stops using data) when you switch station.
- The first time a rider tunes in, they're told live radio uses mobile data (about 1 MB a minute at 128 kbps).
- Offline, or if a stream is down, the radio says so and goes back to Kijiweni FM. The built-in stations always work offline.
- The service worker never caches streams.
