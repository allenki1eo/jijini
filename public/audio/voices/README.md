# Voice recordings

BodaGo plays a recorded voice for any line that has one; every other line stays a speech bubble. You can add recordings one at a time, and the game works with none.

## Adding a recording

1. Record a short clip. **`.mp3` or `.m4a`** work in every browser; `.ogg` and `.wav` work too. Mono, 44.1 kHz, about −16 LUFS and under 4 seconds is ideal.
2. Put the file in this folder (`public/audio/voices/`), e.g. `greet-mama-1.mp3`.
3. List it in `manifest.json` under the key it voices:

```json
{
  "gain": 1,
  "lines": {
    "greet": ["greet-1.mp3", "greet-2.mp3"],
    "hurry": ["haraka-bwana.mp3"],
    "conductor": ["kariakoo-panda.mp3"]
  },
  "people": {
    "Mzee Juma": {
      "tutorial.juma1": ["juma-karibu.mp3"]
    }
  }
}
```

- **`lines`**: any speaker can use these. When a key lists several files, one is picked at random, so record two or three takes for variety.
- **`people`**: recordings for a specific character. They're checked before `lines`, so Mzee Juma can sound like Mzee Juma.
- **`gain`**: overall loudness (0–2).

The music dips while a voice plays. A line is skipped if someone is already talking.

## Keys

The Swahili text the game shows for each key is in `i18n/sw.ts` under `lines`. Record the same meaning; the words don't have to match exactly.

| Key | Who says it | When |
|---|---|---|
| `greet` | Passenger | Getting on the boda |
| `thanks` | Passenger | Dropped off happy |
| `hurry` | Hurry (Haraka) passenger | Riding too slowly; also getting on |
| `scared` | Passenger | Near misses |
| `crash` | Passenger | Hitting something |
| `luggage` | Traveller from the bus stand | Getting on |
| `seller` | Market seller / shopkeeper | You arrive at the shop |
| `haggleAsk` | You (the rider) | Asking for a lower price |
| `haggleYes` / `haggleNo` | Seller | Agreeing / refusing to go lower |
| `change` | Errand customer | You handed back the change |
| `topup` | Errand customer | Prices were higher, they pay you back |
| `conductor` | Daladala conductor | Riding past a bus stand |
| `caller` | Whoever phoned | You answered the phone (any job) |
| `chatHello`, `chatSorry`, `chatHold`, `chatNear` | Passenger | Replies when you talk to them |
| `rider.hello`, `rider.sorry`, `rider.hold`, `rider.near` | You (the rider) | Your quick-chat lines |
| `tutorial.juma1`, `tutorial.juma2`, `tutorial.done` | Mzee Juma | Tutorial dialogue |
| `story.ch1.0` … `story.ch7.3` | Story characters | Story chapter lines (chapter, then line number from 0) |

Text messages (`smsWhere`, `smsThanks`, `smsBusy`) arrive on the phone and aren't spoken.

## Characters

Names to use under `people`: `Mzee Juma`, `Baraka`, `Mama Neema`, `Afande Salum`, and the customers: `Mama Neema`, `Bwana Juma`, `Dada Rehema`, `Kaka Hamisi`, `Bi Mwanaisha`, `Mzee Shabani`, `Mwalimu Grace`, `Daktari Kileo`, `Bwana Musa`, `Mama Zawadi`, `Kaka Baraka`, `Dada Upendo`, `Bi Halima`, `Bwana Peter`, `Mama Joyce`, `Mzee Lukas`. The conductor is `Konda`.

Only add recordings you have the rights to, and get consent from the people whose voices you use.
