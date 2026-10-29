# Deploying BeFit

Two phases. Phase 1 gets the app off your laptop and onto your phone for free.
Phase 2 is what a public Play Store release needs on top of that.

Prices and limits were checked in October 2026. Free tiers change, so re-check
the linked pages before you rely on a number.

---

## Phase 1: personal use, free

| Piece | Where | Cost |
|---|---|---|
| API | Google Cloud Run, `asia-south1` (Mumbai), scales to zero | Free tier: 2M requests and 180k vCPU-seconds per month. One person uses well under 1% of that. |
| Database | MongoDB Atlas free cluster (M0, 512 MB), already in use | Free |
| Secrets | Google Secret Manager | First 6 secret versions free |
| App | APK built locally, or EAS Build (15 free Android builds per month) | Free |

### Why Cloud Run and not the others

- **Render (free):** goes to sleep after 15 minutes idle and takes about a minute to wake up. That means a minute-long wait at breakfast every morning.
- **Fly.io and Railway:** no longer have a free tier for new accounts.
- **Koyeb:** has effectively closed its free tier to new signups in 2026.
- **Oracle Always Free:** a VM you would have to patch and secure yourself. It is reclaimed if left idle, and was cut to 2 OCPUs in June 2026.
- **Cloud Run:** scales to zero but wakes in a few seconds. It gives you HTTPS automatically, runs in Mumbai next to an Atlas cluster there, and is the same platform Phase 2 needs.

The one catch is that Google requires a card on the billing account even for
the free tier. Set a **budget alert at about ₹100** so a mistake can't
surprise you.

### Steps

1. **Atlas**
   - Under Network Access, allow `0.0.0.0/0`. Cloud Run has no fixed outbound IP on the free tier.
   - Give the database user a long random password.
   - If the cluster isn't in Mumbai (`ap-south-1` / `asia-south1`), consider making a new one there. Every request makes 2–6 database round trips, so distance multiplies.
2. **Cloud Run**
   - Follow the one-time setup at the top of `backend/deploy/cloudrun.sh`.
   - Then deploy with `./deploy/cloudrun.sh you@example.com`, run from `backend/`.
   - The email argument becomes `ALLOWED_EMAILS`, so nobody else can register on your server and spend your Gemini quota.
3. **Point the app at it**
   - On a build you already have: Settings → Server → paste the `https://…run.app` URL.
   - For a fresh build: put the URL in `mobile/eas.json` (the `preview` profile) or in `mobile/.env` as `EXPO_PUBLIC_API_URL`.
4. **Build the APK**
   - Local, unlimited and free:
     ```bash
     cd mobile && npx expo prebuild --platform android && cd android && ./gradlew assembleRelease
     ```
   - Or in the cloud with EAS (Expo's build service), 15 builds a month free: `npx eas build -p android --profile preview`.
   - A release build signed with your own keystore cannot install over a debug-signed build. Uninstall the old one first.
   - **Back up the keystore.** If you lose it, you can't update the app.
5. **First start on the real database**
   - The new backend runs two one-off data fixes:
     - It merges duplicate meal logs created by the old double-tap bug.
     - It gives every logged item an ID.
   - Both are safe and recorded in a `meta` collection, so they never run twice. Export your data first anyway if you want a backup (Settings → Export my data).

After the first deploy, `curl https://…run.app/health` should show
`"foods_indexed": 655` (or more, as lookups get cached).

### Things that are now different from running it on the laptop

- "Today" comes from `APP_TIMEZONE` (Asia/Kolkata), not the server clock, so a cloud host in UTC no longer moves midnight snacks to yesterday.
- `/docs` is hidden in production (`EXPOSE_DOCS=false`).
- Plain-HTTP traffic is only needed for a laptop backend on your Wi-Fi. Once the app only talks to the HTTPS Cloud Run URL, you can remove `usesCleartextTraffic` from `mobile/app.json`.

---

## Phase 2: Google Play release

### Account and timing: start this early

- **Play Console account:** $25 one-time fee, plus ID verification.
- **Testing requirement for new personal accounts:** before you can apply for production, you must run a **closed test with at least 12 testers opted in for 14 days in a row**.
  - Recruit 15–25 people, because one dropout can reset the clock.
  - This is the longest step, so start it before the app feels finished.
- **Organisation accounts** skip the 12-tester rule but need a D-U-N-S number, which can take up to about 30 days.

### Build requirements

- **AAB, not APK:** `npx eas build -p android --profile production`. Play App Signing is mandatory, and EAS manages the upload key.
- **Target API level:** API 36 (Android 16) has been required since 31 August 2026. Check that `android/app/build.gradle` shows `targetSdkVersion 36` after prebuild, and set it through `expo-build-properties` if it doesn't.
- Bump `android.versionCode` in `app.json` for every upload.

### Policy items Play will check

All of these are already supported in the app. Paste the matching text into Play Console.

- **Account deletion:** Settings → Delete account (in the app).
  - Play also wants a **web link** where users can request deletion without the app.
  - A simple page with a form, or an email address, is enough.
- **Privacy policy URL:** host the text of the in-app Privacy screen (`app/privacy.tsx`) as a web page, for example on GitHub Pages.
- **Data safety form:** declare:
  - health and fitness data, and photos (meal photos and body-scan reports, processed and not stored);
  - audio (voice, transcribed then discarded);
  - sharing with Google (Gemini) and Sarvam as processors;
  - encryption in transit: yes. Users can request deletion: yes.
- **Health apps declaration:** required for every app that touches health data, even on closed testing.
- **Medical disclaimer in the store listing:** "Not a medical device. Does not diagnose, treat, cure or prevent any condition." The app already says this on the Privacy screen.
- **Content rating:** complete the IARC questionnaire in Play Console.

### Things to change before strangers use it

1. **Gemini on the paid tier.**
   - The free tier's terms forbid sending personal information, let Google use what you send to improve its products (human reviewers included), and aren't allowed for apps likely to be used by under-18s.
   - Paid Flash-Lite costs about $0.10 per million input tokens: a food parse is roughly 500 tokens, so about 2,000 parses for ₹2.
   - Turn on billing in AI Studio for the key the server uses.
2. **Registration.** Clear `ALLOWED_EMAILS` to open sign-ups, and keep the per-user rate limits (already in place).
3. **Age gate.** Add an 18+ confirmation at sign-up. India's DPDP Act requires verifiable parental consent for under-18s, and Gemini's terms exclude them.
4. **Database:** the Atlas free cluster holds 512 MB. When you get near it, move to Atlas Flex (about $8–30/month, capped). M2/M5 no longer exist.
5. **Rate limits:** these are kept in memory per instance. That's fine at `max-instances 2`. If you scale out, move them to Redis (Upstash has a free tier).
6. **DPDP Act (India).** Most obligations apply from about May 2027:
   - a clear consent notice at sign-up;
   - deleting data when consent is withdrawn (already supported);
   - a grievance contact;
   - reporting breaches to the Data Protection Board within 72 hours.

### What Phase 2 costs per month

| Users | Cloud Run | Atlas | Gemini (paid) | Total |
|---|---|---|---|---|
| Closed test (~25) | free | free | well under $1 | ≈ $0 |
| ~1,000 active | free to ~$5 | Flex ~$8–15 | ~$2–5 | ≈ $10–25 |

The $25 Play Console fee is one-time.
