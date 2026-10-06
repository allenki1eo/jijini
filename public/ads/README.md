# Sponsors: real businesses in the game

BodaGo shows local businesses on roadside billboards and on banners strung across main roads, reads their adverts on the radio, and lets riders do Matangazo promo rides for them. Out of the box these are all fictional (see `data/ads.ts`).

To put a **real** business in the game, add it to `manifest.json` here. Sponsors take the first ad slots in the cities you list.

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
| `name`, `tagline` | Required. Keep the tagline short; it's read out on the radio too. `taglineEn` is used in English. |
| `colors` | Background, text and accent, used when there's no image and on road banners. |
| `icon` | One of `utensils`, `wrench`, `smartphone`, `shirt`, `fish`, `pill`, `hammer`, `scissors`, `shield`, `radio`, `wheat`, `droplet`. |
| `cities` | Any of `shinyanga`, `arusha`, `mwanza`, `kariakoo`; leave it out for every city. |
| `image` | Optional billboard poster, **2:1** (e.g. 1024 × 512 PNG or JPG), placed in this folder. |

A radio advert can have a recorded voice: add it to `public/audio/voices/manifest.json` under the key `radio.ad.<id>`.

**Only add a business with its written permission**, and use logos and images it owns or has licensed. Every city has 12 ad slots shared between sponsors and the fictional ads.
