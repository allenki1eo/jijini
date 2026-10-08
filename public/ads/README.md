# Sponsors: real businesses in the game

BodaGo shows local businesses on roadside billboards and on banners strung across main roads, and lets riders do Matangazo promo rides for them. Out of the box these are all fictional (see `data/ads.ts`).

To put a **real** business in the game, add it to `manifest.json` here. Sponsors take the first ad slots in the cities you list.

Sponsors take every other billboard slot in their cities, local businesses fill the rest. **The first sponsor also gets the hero billboard:** a big board on tall legs that faces the rider at the start of every ride, in every city it's listed for.

```json
{
  "sponsors": [
    {
      "id": "mama-rose-saluni",
      "name": "Saluni ya Mama Rose",
      "tagline": "Suka na urembo — Mtaa wa Uhuru",
      "taglineEn": "Braids and beauty — Uhuru Street",
      "colors": ["#E0457B", "#FFFFFF", "#7C3AED"],
      "icon": "scissors",
      "cities": ["kariakoo"],
      "image": "mama-rose.png"
    }
  ]
}
```

| Field | Notes |
|---|---|
| `name`, `tagline` | Required. Keep the tagline short; it has to fit on a banner. `taglineEn` is used in English. |
| `colors` | Background, text and accent, used when there's no image and on road banners. |
| `icon` | One of `utensils`, `wrench`, `smartphone`, `shirt`, `fish`, `pill`, `hammer`, `scissors`, `shield`, `radio`, `wheat`, `droplet`. |
| `cities` | Any of `shinyanga`, `arusha`, `mwanza`, `kariakoo`; leave it out for every city. |
| `image` | Optional billboard poster, **3:1** (e.g. 1800 × 600 JPG, ideally under 200 KB), placed in this folder. Other shapes are cropped to fit, never stretched. |
| `ageRestricted` | `true` for alcohol and other 18+ products. They appear only on billboards (never on road banners or promo rides), and only for players who answered that they're 18 or over. |


East African Spirits (T) Ltd is set up for Shinyanga as a working example (`eas-spirits.jpg`, `eas-beers.jpg`).

**Only add a business with its written permission**, and use logos and images it owns or has licensed. Every city has 12 ad slots shared between sponsors and the fictional ads.
