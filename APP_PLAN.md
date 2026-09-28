# BeFit — Application Plan

> A private, ad-free, subscription-free health and fitness app.
> Built for one person first, designed so anyone can use it.

**Status:** Planning · **Date:** 2026-09-23
**Companion document:** [`yourplan.md`](yourplan.md) — the personal nutrition and training plan the app operationalises.

---

## 1. Product Principles

These are the rules that settle arguments later. When a decision is unclear, the earlier principle wins.

1. **Free to run, forever.** Every external service must have a free tier sufficient for personal use. Any paid dependency is a design failure until proven otherwise. Running cost target: **₹0/month**.
2. **No ads. No subscriptions. No upsells.** Not now, not as a "later monetisation path."
3. **Accuracy is visible, never implied.** Nutrition numbers carry provenance. A verified database value and an AI estimate must never look identical on screen.
4. **Logging must take under 10 seconds.** If a daily action needs more than two taps or one sentence of speech, it is badly designed. This is the feature that decides whether the app gets used in month three.
5. **The plan adapts; the user stays in control.** Every generated value — calorie target, workout, video link, meal — is editable and the edit persists.
6. **Offline-tolerant.** Gym basements and PG rooms have bad signal. Logging works offline and syncs later.

---

## 2. Technology Stack

### 2.1 Mobile app

| Concern | Choice | Why |
|---|---|---|
| Framework | **React Native + Expo (SDK 54+)** | Single codebase, Play Store builds via EAS, mature voice/camera/notification modules. iOS available later at no extra work. |
| Language | **TypeScript** (strict) | Nutrition maths and unit conversions are exactly where silent type bugs cause wrong numbers. |
| Navigation | **Expo Router** (file-based) | Typed routes, deep links for notification taps. |
| Server state | **TanStack Query** | Caching, retries, offline mutation queue, optimistic logging. |
| Client state | **Zustand** | Small, no boilerplate; for UI/session state only. |
| Local storage | **MMKV** + **expo-sqlite** | MMKV for prefs/tokens; SQLite for the offline log queue and cached food database. |
| Forms | **React Hook Form** + **Zod** | Zod schemas shared conceptually with backend Pydantic models. |
| Charts / rings | **react-native-svg** + **Reanimated 3** | Hand-built rings and charts — no chart library bloat, full theme control. |
| Animation | **Reanimated 3** + **Moti** | 60fps ring fills and sheet transitions on the UI thread. |
| Audio capture | **expo-audio** | Voice logging. |
| Camera | **expo-camera** + **expo-image-picker** | Body composition report capture, meal photos. |
| Notifications | **expo-notifications** | Water, meal, sleep and medication reminders. |

### 2.2 Backend

| Concern | Choice | Why |
|---|---|---|
| API framework | **FastAPI** (Python 3.12) | Async, automatic OpenAPI docs, excellent for the AI/ML-adjacent calls. |
| Validation | **Pydantic v2** | One source of truth for every nutrition schema. |
| DB driver | **Motor** (async) + **Beanie** ODM | Async all the way through; Beanie gives typed documents over Pydantic. |
| Database | **MongoDB Atlas M0** (free, 512MB) | Flexible schema fits varied nutrition payloads. 512MB is far more than one user needs. |
| Auth | **JWT** (access + refresh), **passlib/bcrypt** | Self-contained, no third-party auth bill. |
| Background jobs | **APScheduler** (in-process) | Daily rollups, streak calculation, plan regeneration. No separate worker infrastructure. |
| Caching | MongoDB TTL collections | Avoids a Redis dependency; adequate at this scale. |
| Hosting | **Fly.io** or **Render** free tier | Both host a small FastAPI container free. Fly.io preferred (no forced cold-start sleep on the paid-but-generous tier). |

**Deliberate omissions:** no Redis, no Celery, no Docker Compose orchestration, no microservices. One API process, one database. The complexity budget is spent on nutrition accuracy and the logging experience instead.

### 2.3 External services

All verified live on 2026-09-23. Every one has a free tier that covers personal use.

| Concern | Choice | Free tier | Key? |
|---|---|---|---|
| **Indian food data** | **Anuvaad INDB** dataset, self-hosted | Free download — 1,095 items + **1,014 cooked Indian recipes** | No |
| **Indian raw ingredients** | **IFCT 2017** (`github.com/ifct2017/compositions`) | 542 foods, full micronutrient + amino acid panels | No |
| **Packaged / barcode** | **Open Food Facts** | Unlimited, ~23,000 Indian products; full MongoDB dump available | **No key** |
| **Western / generic food** | **USDA FoodData Central** | **1,000 requests/hour** | Yes (free, instant) |
| **AI — chat, parsing, OCR** | **Google Gemini** | `gemini-3.5-flash` + `gemini-3.5-flash-lite` are free | Yes (free) |
| **Voice (default)** | **Android `SpeechRecognizer`** | Free, on-device, unlimited | **No key** |
| **Voice (Indian languages)** | **Sarvam AI** `saaras:v4` | ₹100 free credits (~3.3 hrs), then ₹30/hr | Yes (optional) |

**Three deliberate changes from the original brief**, each with a reason:

1. **SERP API is not the fallback — Gemini is.** SerpAPI gives 250 searches/month free then jumps to $25/month, and it returns *web pages*, which still have to be scraped and parsed into nutrition numbers. Gemini returns structured JSON directly in one hop, on the free tier, using a key the app needs anyway. Tavily (1,000 free credits/month, no card) stays as an optional grounding step if estimates ever prove unreliable.

2. **Voice defaults to on-device, not Sarvam.** Android's built-in recogniser is free, unlimited, needs no key, and — importantly for health data — **the audio never leaves the phone**. Sarvam becomes a button for when she wants to log in Tamil or Hindi, or in code-mixed speech, where it is genuinely better. This keeps the ₹100 of credits lasting months instead of days.

3. **The primary food database is self-hosted, not an API.** This is the single most important decision in the app. No commercial nutrition API knows what a poriyal is. Nutritionix retired its free tier, FatSecret puts Indian data behind a paywall, and Spoonacular allows 150 points/day. Loading INDB + IFCT into her own Atlas cluster gives idli, dosa, upma, khichdi and sambar with real ICMR-backed numbers — free, instant, rate-limit-free and working offline.

**⚠️ Licensing — matters because of the Play Store goal.** IFCT 2017's repository relicensed to **AGPL-3.0 in April 2025**. AGPL's network clause can require publishing the backend source of a hosted service that uses it. The Anuvaad INDB licence is described as "open access" but is not explicitly stated. Before publishing: use INDB as the primary dataset and confirm its terms with the authors, treat IFCT as verification-only during development, or accept open-sourcing the backend (which fits this project's ethos anyway). Flagged now because it is cheap to design around and expensive to discover at submission.

**⚠️ Gemini free-tier limits are unpublished.** Google removed per-model request-per-day numbers from its docs; they are now only visible in the AI Studio dashboard. The app must therefore be built to tolerate a low ceiling: cache every AI result to MongoDB, use `flash-lite` for high-frequency parsing, reserve `flash` for coach chat, and degrade gracefully to manual entry when quota is hit. Check the real limits in AI Studio once the key is created.

**⚠️ Gemini free-tier data is used to improve Google's products.** For health data this is worth a conscious decision. Mitigation: never send identifying information in prompts — send physiology and the day's numbers only (sex, age band, weight, relevant conditions), never the user's name or email address.

---

## 3. Design System

The brief: **light purple and white, clean, professional, usable every single day**. The risk with purple is looking either childish or like a meditation app. The defence is restraint — purple is used for brand, primary action and one data series; everything else is near-neutral with a faint violet undertone so the whole surface feels intentional rather than grey.

### 3.1 Colour

**Brand — violet**

| Token | Hex | Use |
|---|---|---|
| `violet.50` | `#F6F4FE` | Tinted section backgrounds |
| `violet.100` | `#EDE9FE` | Selected chips, ring tracks |
| `violet.200` | `#DCD4FD` | Borders on tinted surfaces |
| `violet.300` | `#C3B4FB` | Disabled primary, decorative |
| `violet.400` | `#A78BFA` | **Dark-mode primary** |
| `violet.500` | `#8B5CF6` | Accents, icons, gradients |
| `violet.600` | `#7C3AED` | **Primary action fill** (white text = 5.5:1 ✓ AA) |
| `violet.700` | `#6D28D9` | Pressed state |
| `violet.900` | `#4C1D95` | Display headings, shadow tint |

**Neutrals** — warmed toward violet so they never read as cold grey.

| Token | Light | Dark |
|---|---|---|
| `canvas` | `#FBFAFD` | `#100D17` |
| `surface` | `#FFFFFF` | `#1A1523` |
| `surface.sunken` | `#F4F2F8` | `#241D30` |
| `border` | `#E9E5F2` | `#322942` |
| `text` | `#17131F` | `#F4F2F8` |
| `text.secondary` | `#5F5870` | `#A79FB8` |
| `text.muted` | `#8F87A1` | `#7D7490` |

**Data series** — chosen to stay distinguishable under deuteranopia and protanopia by varying *lightness* as well as hue. Colour is never the only signal: every ring and bar carries a label and a number.

| Series | Hex | |
|---|---|---|
| Protein | `#7C3AED` | violet — the hero macro |
| Carbs | `#F59E0B` | amber |
| Fat | `#0EA5E9` | sky |
| Fibre | `#10B981` | emerald |
| Water | `#38BDF8` | light sky |
| Sleep | `#6366F1` | indigo |
| Workout | `#F43F5E` | rose |

**Semantic:** success `#059669` · warning `#D97706` · danger `#DC2626` · info `#2563EB`

**Provenance badges** (principle 3 made visible):
- `Verified` — emerald dot — curated Indian food DB or a value the user corrected herself
- `Database` — violet dot — USDA / Open Food Facts
- `Estimated` — amber dot — AI-derived, tap to see the assumption and correct it

### 3.2 Typography

- **Plus Jakarta Sans** — headings, numerals, stat displays. Geometric and confident without being sporty-aggressive.
- **Inter** — body and UI text. The most legible UI face at small sizes.

Both are free via Google Fonts (`@expo-google-fonts/plus-jakarta-sans`, `@expo-google-fonts/inter`).

| Role | Size/Line | Font |
|---|---|---|
| Display XL | 40/44, 800 | Jakarta, tabular |
| Display | 32/38, 700 | Jakarta, tabular |
| H1 | 26/32, 700 | Jakarta |
| H2 | 21/28, 600 | Jakarta |
| H3 | 17/24, 600 | Jakarta |
| Body | 15/22, 400 | Inter |
| Body Small | 13/18, 400 | Inter |
| Caption | 11/16, 600, +0.6 tracking, uppercase | Inter |

All numeric displays use `fontVariant: ['tabular-nums']` so counters don't jitter while animating.

### 3.3 Form

- **Spacing** — 4pt base: 4, 8, 12, 16, 20, 24, 32, 40, 48
- **Radii** — sm 10 · md 14 · lg 20 · xl 28 · pill 999
- **Shadows** — violet-tinted (`#4C1D95`, 6–10% opacity), never black. Cards sit on `canvas` with a 1px `border` plus a whisper of shadow.
- **Motion** — 180–260ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`. Rings animate from 0 on mount. Respect `prefers-reduced-motion`.
- **Touch targets** — 44×44 minimum. The primary log button is 64×64 and thumb-reachable.

---

## 4. Information Architecture

Five tabs with a centre action button. The Coach is a header affordance on every screen rather than a tab, because questions are contextual — you ask about the meal you are looking at.

```
┌──────────────────────────────────────────────┐
│  Today    Food    ( ＋ )    Train    Body    │
└──────────────────────────────────────────────┘
                     ▲
          voice-first universal quick-log
```

| Tab | Contains |
|---|---|
| **Today** | Dashboard — calorie + macro rings, water, sleep, today's workout card, today's meals, streaks |
| **Food** | `Log` · `Weekly Plan` · `Insights` — search, micronutrient panel, meal calendar, trends |
| **＋** | Voice-first quick log: food, water, weight, workout — one sheet, spoken or tapped |
| **Train** | `Today` · `Week` · `Library` — the day's split, machines, videos, calendar, exercise library |
| **Body** | `Weight` · `Composition` · `Focus Areas` — weight trend, OCR'd body scans, body-map fat and focus marking |

**Coach** — sparkle icon in the header, available everywhere, aware of the screen you opened it from.
**Profile / health conditions / settings** — avatar in the Today header.

### 4.1 Screen inventory

**Onboarding (7 steps)** — profile → body stats → goal weight & pace → health conditions and medication → dietary rules (veg days, foods excluded) → routine (wake/sleep/gym times) → generated plan review.

**Today** — compact calorie card (96px ring + eaten/target); today's meals; macro bars; a row through to micronutrients; water in real containers (200 ml / 500 ml / 1 L) with undo; seven-night sleep chart against target; supplement tick list.

**Micronutrients** (`/micros`) — 20+ nutrients grouped by priority, upper limits flagged as limits rather than targets.

**Supplements** (`/supplements`) — add, edit, pause and remove; weekday scheduling; levothyroxine interaction warnings.

**Food** — three segments. *Log food*: search with instant results, provenance badge, quantity editor with real household units (1 idli, 1 katori, 250g). *My meals*: saved meals logged in one tap, edited on `/meal-edit`. *Weekly plan*: the meal calendar, editable on `/diet-edit`, with a create-from-example path when no plan exists.

**Train** — progress strip through to `/progress`; today's split with focus area; exercises with tick-off checkboxes and per-exercise sets and load; embedded YouTube player with **editable video link**; session duration and finish; week calendar; plan editing on `/workout-edit`.

**Progress** (`/progress`) — streak, weekly and monthly completion, month calendar, and an 8-week chart across sessions, minutes, calories and volume.

> **Link health check.** YouTube videos get deleted. A weekly APScheduler job pings `youtube.com/oembed?url=…` for every stored link — a 404 means the video is gone — and flags dead links in the app with a prompt to pick a replacement. Cheap to build, and it stops the workout screen silently rotting over a year of use.

**Body** — weight entry and trend chart with a moving average; target progress; body composition report capture → OCR → **review-and-correct screen** before saving; interactive SVG human body (front/back) to mark fat areas and focus areas; measurement log; progress photos.

**Coach** — chat with full access to the user's logged data, health conditions and plan; suggested prompts; explicit medical-advice disclaimer.

---

## 5. The Voice Logging Pipeline

This is the feature that makes or breaks daily use, so it gets designed properly rather than bolted on.

```
🎙 Hold to speak
   │
   ├─ expo-audio records   ──►  POST /voice/transcribe  (audio blob)
   │
   ├─ Speech-to-text                    → "two idlis with sambar and a boiled egg"
   │
   ├─ LLM structured extraction         → [{food:"idli", qty:2, unit:"piece"},
   │  (JSON schema / function calling)     {food:"sambar", qty:1, unit:"katori"},
   │                                       {food:"boiled egg", qty:1, unit:"piece"}]
   │
   ├─ Resolve each item through the nutrition chain (§6)
   │
   └─ ►► REVIEW SHEET — user confirms or corrects, then saves
```

**The review step is non-negotiable.** Silently trusting a transcription plus an LLM guess is how a tracker quietly becomes wrong by 300 kcal a day. The sheet shows each parsed item with its quantity, provenance badge and a one-tap correction. Corrections are stored as **personal overrides** — so the second time she says "PG sambar", it resolves to her corrected value instantly and for free.

**Accuracy compounds.** Every confirmed entry enriches her personal food database. After a few weeks the common foods resolve from local `Verified` data with no API call at all.

---

## 6. Nutrition Accuracy Strategy

Her stated requirement is that nutrition information must be accurate. Generic food APIs are weak on Indian foods — "idli" and "poriyal" are frequently missing or wildly wrong. So accuracy is engineered as a tiered chain rather than a single lookup.

```
TIER 1  Personal overrides        foods she has corrected before      [Verified] ★
TIER 2  INDB + IFCT (self-hosted) idli, dosa, sambar, poriyal…        [Verified]
TIER 3  Open Food Facts           barcode scan, packaged goods        [Database]
TIER 4  USDA FoodData Central     Western/generic, full micro panel   [Database]
TIER 5  Gemini estimation         last resort — flagged and editable  [Estimated]
                                       │
                                       └──► result written back to Tier 1
```

Tiers 1 and 2 are local MongoDB lookups: no network, no rate limit, no cost, and they will serve the overwhelming majority of her logging because she eats a fairly fixed set of foods.

**The feedback loop is what makes this accurate over time.** Every Gemini estimate and every user correction is written back into her personal food collection. Unknown foods are paid for once. By month two, "PG sambar" and "office fried rice" resolve instantly from `Verified` local data, and Tier 5 is almost never reached.

Every log entry records `source`, `confidence` and `resolved_at`. The daily totals screen reports what share of the day's calories came from estimated data — if that share is high, the big number at the top of the screen deserves less trust, and the app says so instead of pretending.

**Micronutrient targets** are seeded from ICMR-NIN 2020 Indian RDAs rather than US values, because they correctly assume lower bioavailability from Indian diets (iron 29 mg vs 18 mg, zinc 13 mg vs 8 mg). See `yourplan.md` §4 for the full configured panel.

**One hard safety rule coded into the app:** iodine has an upper bound, not just a target. In autoimmune thyroid disease, harm has been documented at supplemental doses as low as 250 µg/day. The app must warn — not congratulate — if logged iodine climbs above 150 µg from supplements, and the Coach is instructed never to recommend kelp, seaweed or "thyroid support" blends.

---

## 7. Data Model (MongoDB)

```
users                 auth, email, created_at
profiles              age, sex, height, weight, activity, health_conditions[],
                      medications[], dietary_rules{veg_days[], excluded_foods[]},
                      routine{wake, sleep, gym_start, gym_end}
targets               versioned — kcal, macros{}, micros{}, effective_from
                      (history kept so past days are judged against the target
                       that was actually active then)

food_items            name, aliases[], per_100g{macros, micros}, household_units[],
                      source, confidence, is_personal_override, owner_id?
food_logs             date, meal, items[{food_id, qty, unit, resolved_nutrition{}, source}]
water_logs            date, entries[{ml, at}]
sleep_logs            date, bed_at, wake_at, duration_min, quality
weight_logs           date, kg, note
body_composition      date, image_url, ocr_raw, extracted{fat_pct, muscle_kg,
                      visceral, segmental{}}, user_corrected
body_maps             date, kind: 'fat'|'focus', zones[{id, intensity}]

exercises             name, muscle_group, equipment, cues[], default_video_url,
                      sets, reps, is_system
workout_plans         week_template{day → {focus, exercises[], video_url, notes}}
workout_sessions      date, plan_day, completed[], duration_min, felt

diet_plans            week_template{day → {meal → options[]}}
chat_threads          messages[{role, content, at}], context_snapshot
```

**Note on `targets` versioning:** as she loses weight her calorie target drops. Without versioning, a day logged in month one gets re-scored against month four's target and history becomes meaningless. Cheap to build now, impossible to reconstruct later.

---

## 8. API Surface (FastAPI)

```
POST   /auth/register · /auth/login · /auth/refresh
GET    /me/profile              PATCH /me/profile
GET    /me/targets              POST  /me/targets/recalculate

GET    /food/search?q=
POST   /food/resolve            → runs the tier chain, returns nutrition + provenance
POST   /food/custom             → create a personal food
GET    /logs/food?date=         POST /logs/food        DELETE /logs/food/{id}
GET    /logs/day?date=          → the whole day rolled up: kcal, macros, micros vs target

POST   /voice/transcribe        → audio → text
POST   /voice/parse             → text → structured draft entries (for the review sheet)

POST   /logs/water · /logs/sleep · /logs/weight
POST   /body/composition        → image → OCR → extracted draft (user confirms)
GET/PUT /body/map

GET    /workouts/today · /workouts/week
PATCH  /workouts/exercise/{id}/video    ← editable YouTube link, persisted
POST   /workouts/session

GET    /diet/week               PUT /diet/week
POST   /chat                    → streaming coach response
```

---

## 9. Offline Behaviour

Logging is queued locally (SQLite) and replayed on reconnect. Food resolution falls back to the on-device cached food list, which covers her regular foods. The gym screen pre-caches the week's plan and video IDs so the day's workout is readable without signal.

---

## 10. Privacy & Play Store Readiness

Health data is sensitive, and Google's Play Store review treats it that way.

- All data scoped to the authenticated user; no third-party analytics SDKs.
- Voice audio is transcribed and **discarded** — only the resulting text is stored.
- Body composition images stored privately, deletable, never used for anything else.
- Full data export (JSON) and hard account deletion — a Play Store requirement, and the right default.
- A **Health Disclaimer** shown at onboarding and inside Coach: this app is not a medical device and does not replace a doctor. Because users may have conditions such as hypothyroidism, the Coach must be explicitly instructed never to advise on medication dosage.
- Play Store needs: privacy policy URL, Data Safety form, Health apps declaration, target API level compliance.

---

## 11. Build Roadmap

Ordered so the hardest, highest-value thing lands first, per the agreed build order.

| Phase | Scope | Status |
|---|---|---|
| **0 — Foundations** | Repo, design tokens, FastAPI skeleton, Atlas connection, auth, onboarding | ✅ Done |
| **1 — Food + Voice** | Nutrition chain, 116-food Indian seed DB, search, logging, macro rings, micronutrient panel, **voice logging + review sheet** | ✅ Done |
| **2 — Body & Vitals** | Weight, target, trend, water, sleep, body composition OCR, body maps | ✅ Done |
| **3 — Train & Diet Plan** | Weekly gym calendar, machines, editable videos, weekly meal plan, PG swaps | ✅ Done (session logging API exists, no UI yet) |
| **4 — Coach** | Chat with data context, health-condition awareness, safety rules | ✅ Done |
| **4.5 — Daily-use pass** | Home reordered and compacted, water presets, 7-night sleep chart, supplements, saved meals, plan editors, session logging + progress | ✅ Done |
| **5 — Ship** | Offline sync, notifications, export/delete, privacy policy, EAS build, Play Store submission | ⬜ Not started |

### Phase 4.5 detail

Driven by the first round of real use. Everything here replaced something that
looked fine in a screenshot but cost too many taps in a kitchen.

- **Home** — calorie ring cut from 208px to 96px and laid out horizontally; order is now calories → today's meals → macros → micronutrient link → water → sleep → supplements.
- **Micronutrients** moved off Home to `/micros`, reached by one row that names the lowest-scoring nutrient so the row still earns its place unread.
- **Supplements** replaced the "Key nutrients" card: per-day tick list with CRUD, weekday scheduling, and an automatic warning on anything that binds levothyroxine (iron, calcium, magnesium, zinc, multivitamins).
- **Water** logs in real containers — 200 ml glass, 500 ml bottle, 1 L — with one-tap undo.
- **Sleep** shows a seven-night bar chart against the target, with missing nights rendered as gaps rather than zeros.
- **Saved meals** (`/meals`) — build "Oats with dry fruits" once, log it in one tap. Nutrients frozen at save time, sorted by how often each is logged.
- **Plan editing** — dedicated editors for a diet day and a workout day, with copy-a-day, reordering and a create-from-example path for a profile with no plan.
- **Session logging** — tick exercises off as you go, record sets and load, mark the video done, pick a duration. State survives backgrounding.
- **Progress** (`/progress`) — streak that skips planned rest days, week/month completion, month calendar with trained/rest/missed as three distinct states, and an 8-week chart switchable between sessions, minutes, calories and volume.

> **Workout calories are never added to the food budget.** METs come from the
> Compendium of Physical Activities (3.5 resistance, 5.0 follow-along video,
> 3.3 walking) and are multiplied by logged bodyweight. They feed progress
> tracking only, because the 1.55 activity factor in her TDEE already assumes
> six training days a week — crediting the session again would hand her an
> extra 300–400 kcal a day.

**Still open from earlier phases:** barcode scanning UI (API done), food-correction UI (API done), weekly link-health check job, and the `targets` auto-adjustment from 3 weeks of real weight data.

---

## 12. Keys and Accounts Required

### Required — the app will not run without these

| # | Service | What it is for | Free tier | Where |
|---|---|---|---|---|
| 1 | **MongoDB Atlas** | The database | M0 cluster, 512 MB, free forever | `cloud.mongodb.com` → create cluster → connection string |
| 2 | **Google AI Studio (Gemini)** | Coach chat, voice→food parsing, body-scan OCR | Flash + Flash-Lite free | `aistudio.google.com/apikey` |
| 3 | **USDA FoodData Central** | Western/generic foods with full micronutrient panels | 1,000 req/hour | `fdc.nal.usda.gov/api-key-signup` |

### Optional — adds capability, app works without them

| # | Service | What it is for | Free tier | Where |
|---|---|---|---|---|
| 4 | **Sarvam AI** | Voice logging in Tamil/Hindi/code-mixed speech | ₹100 credits (~3.3 hrs), then ₹30/hr | `dashboard.sarvam.ai` → API Keys |
| 5 | **Google Cloud Vision** | OCR backup if Gemini quota is hit | 1,000 units/month (needs billing enabled) | GCP Console |
| 6 | **Tavily** | Grounding search if AI estimates prove unreliable | 1,000 credits/month, no card | `tavily.com` |

### No key needed
Open Food Facts · Anuvaad INDB dataset · IFCT 2017 dataset · Android on-device speech recognition

### `.env` template

```bash
# ---- Required ----
MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/befit?retryWrites=true&w=majority"
GEMINI_API_KEY="..."
USDA_FDC_API_KEY="..."
JWT_SECRET_KEY="..."          # generate: openssl rand -hex 32

# ---- Optional ----
SARVAM_API_KEY=""             # sent as header: api-subscription-key
GOOGLE_VISION_API_KEY=""
TAVILY_API_KEY=""

# ---- Config ----
GEMINI_CHAT_MODEL="gemini-3.5-flash"
GEMINI_UTILITY_MODEL="gemini-3.5-flash-lite"
SARVAM_STT_MODEL="saaras:v4"
OPENFOODFACTS_USER_AGENT="BeFit/1.0 (contact@example.com)"
```

**Total monthly cost: ₹0.**

### Where secrets live

Three layers, by trust level. The boundary between them is the most important security rule in this project.

| Layer | Holds | Mechanism |
|---|---|---|
| **Backend, local dev** | Every third-party API key | `backend/.env`, gitignored |
| **Backend, production** | The same keys | Host secret store — `fly secrets set` / Render env vars. Never a `.env` file uploaded to the server. |
| **The phone** | Only the user's own JWT access + refresh tokens | `expo-secure-store` → Android Keystore. Never `AsyncStorage`, which is plaintext. |

### 🔒 No API key ever ships inside the app

An Android `.aab` or `.apk` is a zip file. Anyone can download it from the Play Store, unzip it, and read every string inside — including anything in `EXPO_PUBLIC_*`, `app.json` → `extra`, or hardcoded in JS. There is no obfuscation that fixes this.

So the mobile app **never** calls Gemini, USDA, Sarvam or Vision directly. It calls the BeFit backend, and the backend makes those calls with keys the phone has never seen:

```
📱 App  ──(JWT)──►  🔒 FastAPI  ──(API keys)──►  Gemini · USDA · Sarvam
                    keys live here, only here
```

This is also *why* the voice and OCR pipelines route audio and images through the backend rather than hitting the provider from the device. It looks like an extra hop; it is the thing that keeps the keys private.

If a key does leak, rotate it at the provider and redeploy — no app update required, because the app never had it.

### Files

```
BeFit/
├── .gitignore                    ← blocks .env, keystores, *.aab
└── backend/
    ├── .env                      ← real values, gitignored
    ├── .env.example              ← committed template, no values
    └── app/core/config.py        ← typed loader; fails fast if a required key is missing
```

`config.py` declares required keys without defaults, so a missing key stops the app at startup with a clear error instead of surfacing as a confusing 500 on the first food lookup.

---

## 13. Open Questions

1. **INDB licence** — confirm redistribution terms before Play Store submission (§2.3).
2. **Gemini real rate limits** — read from the AI Studio dashboard once the key exists; the app's caching aggressiveness depends on it.
3. **Backend hosting** — Fly.io vs Render free tier; decide at Phase 0.
4. **Multi-user** — the schema already supports it, but onboarding, plan generation and the Coach are currently tuned to one person. Generalising is a Phase 6 concern, after the app is proven in daily use.

---
