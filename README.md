# BeFit

A personal health and fitness tracker — food, training, body and sleep — built to
run on free and open-source infrastructure. No ads, no subscription, no data
resale.

The premise is that a tracker should be honest about where its numbers come
from. Every food carries a provenance badge (**verified** / **database** /
**estimated**), and the day's summary says outright what share of your calories
came from an AI estimate rather than a measured value.

## What it does

- **Food** — one Add food screen with search, **voice** ("two idlis with sambar
  and a boiled egg"), **photo** (snap the plate, confirm the items), **barcode**
  and quick-add calories. Every food has real portions — "1 idli", "1 katori",
  "1 tbsp", grams — with a quantity stepper and fractions, and dishes come with
  their variations side by side (chapati / with ghee / paratha). Usual, recent
  and frequent foods log again in one tap at last time's amount; yesterday's
  meal copies across in one tap; logged items can be edited, moved or removed.
  Saved meals and home recipes (ingredients + cooked weight) cover home
  cooking; anything else can be entered from the packet or corrected, and
  the correction is used from then on. Macros *and* 20+ micronutrients are
  tracked against targets.
- **Training** — a weekly plan you can edit, per-exercise tick-off with sets and
  load, MET-based calorie estimates, streaks, a month calendar and volume trends.
- **Body** — weight trend, body-composition capture by photo OCR, and an
  interactive body map for marking fat and focus areas.
- **Sleep & water** — bed/wake times with a seven-night trend; water logged in
  real containers (glass, bottle, litre).
- **Supplements** — daily checklist with weekday scheduling, and automatic
  warnings for supplements that interfere with medication absorption.
- **Coach** — a chat assistant with access to your logged data, under hard-coded
  safety rules: it will not advise on medication dosage, will not recommend
  iodine supplements, and will not claim spot reduction works.

## Nutrition accuracy

Food lookups walk a six-tier chain, cheapest and most trustworthy first:

```
personal entries → local Indian food DB → Open Food Facts
                 → USDA FoodData Central → web search → AI estimate
```

Anything resolved from a network tier is written back to the local database, so
an unknown food costs a lookup once. Foods you enter by hand become personal
verified entries that outrank everything else from then on.

Two rules keep the chain from confidently returning the wrong food:

**A local hit is only accepted when it genuinely matches.** Text search is
term-based, so "pumpkin seeds" matches sesame seeds on the word "seeds".
Matching is scored token-first — `0.75 × token_coverage + 0.25 × string_ratio`,
with per-token fuzzy comparison so typos survive — and anything below the floor
is dropped rather than shown. "pumpkin seeds" against "sesame seeds" scores
0.52 and is rejected; "pumpkin sed" against "pumpkin seeds" scores 0.93 and is
accepted.

**An external hit is verified before it is trusted.** Spelling is corrected
before the query leaves the building, because USDA answers "pumpkin sed" with
"Bread, pumpkin". Whatever comes back is then scored against the query and
discarded if it isn't actually the food that was asked for.

The seeded database holds ~120 curated Indian dishes (IFCT 2017 and the Anuvaad
Indian Nutrient Databank), a handful of variants computed from them exactly
(chapati + 1 tsp ghee), and all 542 raw foods of IFCT 2017 with their names in
Indian languages as search aliases — "sajje" and "kambu" both find bajra. Recipe items were recomputed from raw ingredients with
cooking-retention factors, because several published values are stated on a
raw-ingredient basis and are badly wrong if used directly.

> **Not a medical device.** Targets follow ICMR-NIN recommendations, but this is
> not medical advice and does not replace a doctor.

## Stack

| Layer | Choice |
|---|---|
| Mobile | React Native 0.86 · Expo SDK 57 · Expo Router · TypeScript |
| State | TanStack Query · Zustand · Reanimated |
| Backend | FastAPI · Python 3.11 · Beanie ODM · MongoDB Atlas |
| AI | Google Gemini (structured output for food parsing and estimates) |
| Voice | Sarvam `saarika` speech-to-text, built for Indian and code-mixed speech |
| Nutrition | IFCT 2017 · Anuvaad INDB · USDA FDC · Open Food Facts · Tavily web search |

## Running it

**Backend**

```bash
cd backend
python3.11 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
cp .env.example .env          # then fill in your own keys
./.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Mobile** (Node 22+)

```bash
cd mobile
npm install
npx expo start
```

The app finds the backend automatically when run through Expo. A standalone
build has no dev server to ask, so it falls back to a compiled-in address —
editable at runtime from **Sign in → "Can't connect? Server settings"**, which
is also where you point it at a deployed server.

## Configuration

`backend/.env.example` lists every key. Required: a MongoDB connection string, a
JWT signing secret, and a Gemini API key. Optional: USDA FoodData Central (raises
the rate limit), Sarvam (server-side speech-to-text) and Google Vision (body-scan
OCR). No key is ever shipped inside the mobile app — the app holds a JWT and the
backend holds the credentials.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md): free hosting for personal use (Cloud Run in
Mumbai + Atlas free tier) and the Play Store checklist for a public release.

## Tests

`backend/tests/smoke_api.py` exercises the API end to end against a running
server — use a throwaway database (`MONGODB_DB=befit_qa`), never the real one.

## Licence

Not yet chosen. The IFCT 2017 data is loaded from `@ifct2017/compositions@2.0.9`,
the last MIT-licensed release; later releases are AGPL-3.0 and must not be
swapped in without re-checking. The underlying tables are NIN-ICMR's
publication, and the Anuvaad INDB recipe values used in the curated seed have
no stated licence — ask the authors before a public release.
