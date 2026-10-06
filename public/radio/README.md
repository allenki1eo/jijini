# Live radio

Besides its three built-in stations (Kijiweni FM, Bongo Vibes, Pwani Taarab), BodaGo plays **real Tanzanian stations**. They are on the Redio screen (from the main menu) and on the boda phone while you ride. On the ride HUD they also come up on the radio button (or the R key) after the built-in ones, marked **LIVE**.

The listener's browser fetches the audio directly from the station. BodaGo does not proxy or rebroadcast it.

## Adding a station

1. Find its **HTTPS** stream URL: the station's own public stream, or an open directory such as [Radio Browser](https://www.radio-browser.info/). Plain `http://` streams are blocked on an HTTPS site, so leave those out.
2. Confirm the URL actually plays (decode a couple of seconds, and check the stream name matches the station). If you cannot confirm it, do not add it.
3. Add it to `stations.json` here. `source` is where the URL came from and how it was checked, so the next edit is easy.

```json
{
  "live": [
    {
      "id": "station-name",
      "name": "Station Name",
      "freq": "88.4",
      "city": "Dar es Salaam",
      "genre": "bongo",
      "group": "dar",
      "url": "https://stream.example.co.tz/live.mp3",
      "color": "#E60000",
      "source": "The station's public stream. Verified YYYY-MM-DD: ffmpeg decoded MP3, icy-name Station Name."
    }
  ]
}
```

| Field | Notes |
|---|---|
| `id` | Stable slug. The app stores `live:<id>` in settings. |
| `name` | Shown on the list, the radio chip and the lock screen. |
| `freq` | Shown next to the name. Use `LIVE` when there is no frequency. |
| `city` | City or town, when we know it. |
| `genre` | One of `news`, `talk`, `bongo`, `hits`, `gospel`, `sports`, `music`, `community`. |
| `group` | One of `national`, `dar`, `regional`, `religious`. |
| `url` | Must start with `https://`. MP3 and AAC play everywhere; HLS (`.m3u8`) plays on Safari and recent Chrome on Android. |
| `color` | Accent for the station's monogram. There is no logo file; the monogram is the fallback. |
| `source` | Where the stream URL came from, and how it was verified. |

## How it behaves

- One station plays at a time. Play, pause and stop are on the station list. Connecting shows a spinner. If you are offline, or the stream will not start, the radio says so instead of spinning forever.
- Live audio follows the music volume (a quiet floor is used on the Redio screen if music is muted). Stop leaves the station selected but does not keep the connection open. Switching station, turning the radio off, or leaving a ride drops the stream.
- The stream keeps playing when the screen locks. The system media controls show the station name, frequency and city (Media Session), with play, pause and stop. The ride's engine sounds still pause in the background.
- The first time a rider tunes in during a ride, they're told live radio uses mobile data (about 1 MB a minute at 128 kbps).
- During a ride, if a stream dies, the radio says so and goes back to Kijiweni FM. On the Redio screen it stays on that station and asks you to try again. The built-in stations always work offline.
- The service worker never caches streams.

## Left out on purpose

These are listed on radio-tanzania.com but are not in `stations.json`, because a phone on this HTTPS app could not play them:

| Station | Why it was dropped |
|---|---|
| Clouds FM 88.5 | The public stream is HTTP only (`eu6.fastcast4u.com:5306`). HTTPS on that port fails the TLS handshake. The HTTP stream itself is a 128 kbps MP3. |
| ZBC Radio 90.5 | HTTP only (`102.214.45.109:8000`). |
| Radio Maarifa 105.3 | HTTP only (`159.65.36.126:8000`). |
| Radio Sauti ya Injili 92.3 | HTTP only (`212.227.150.101:6801`). |
| Shalom Radio Arusha 97.3 | HTTP only. |
| UFM 107.3, Mbingu Duniani 98.1, Morning Star 105.3, Baba Yao FM | The directory points at `stream.zeno.fm` mounts that return HTTP 401 with an empty body, so playback could not be confirmed. |
