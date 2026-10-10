# Trucksy — Launch Guide

From "it runs on my laptop" to real trucks on the road. Follow the phases in order and tick each box as you go. Plan on about 3–4 weeks of part-time work. Most of that is waiting on Google's review rules, not building.

---

## Phase 0 — Get the code safe (Day 1, 1 hour)

You lost the v1 source because it was never committed to Git. That must not happen again.

- [ ] Create a free GitHub account if you don't have one, then make a **private** repository named `trucksy`.
- [ ] Unzip this project into a folder that is **not** inside OneDrive, Google Drive or Dropbox. Use something like `C:\dev\trucksy`.
- [ ] In that folder, run:
  ```bash
  git init
  git add .
  git commit -m "Trucksy v2"
  git branch -M main
  git remote add origin https://github.com/<you>/trucksy.git
  git push -u origin main
  ```
- [ ] **Rule from now on:** commit at the end of every working session. `git add . && git commit -m "what I did" && git push`.

## Phase 1 — Run it locally and learn it (Days 1–3)

- [ ] Follow **README → Run it on your laptop**. Sign in as `admin` / `trucksy123`.
- [ ] Run `python manage.py simulate_drivers` and watch the trucks move on the map.
- [ ] Do one full job yourself:
  1. Click **New load** and assign it to Yasir.
  2. Open the driver app in your browser (`npx expo start`, then press `w`) and sign in as `34180130` / `1234`.
  3. Tap through **Start driving → Goods loaded → Leave for drop-off → Mark as delivered**.
  4. Open the load in the dashboard and check its history.
  5. Click **Open tracking page**. That's exactly what the customer sees.
- [ ] Open `/admin/` to see the raw data. This is your back office.
- [ ] Read these files in this order, because each one is short and they make up the whole system: `fleet/models.py` → `loads/models.py` → `fleet/views.py` → `loads/views.py` → `driver-app/src/app/(tabs)/index.tsx` → `driver-app/src/lib/tracking.ts`.

> **Teacher's note:** the most important idea is in `loads/models.py`, where `DRIVER_FLOW` defines the steps. Drivers can only move a job forward one step at a time, and every move is logged with who did it, when and where. That audit trail is what makes a logistics product trustworthy.

## Phase 2 — Put the backend online (Day 4, 1–2 hours)

We use **Render** because it reads the `render.yaml` blueprint that's already in the project.

- [ ] Sign up at render.com with your GitHub account.
- [ ] Choose **New → Blueprint**, then pick your `trucksy` repo. Render creates the web service and the Postgres database together.
- [ ] Wait for the first deploy to finish. You'll get an address like `https://trucksy-api.onrender.com`.
- [ ] In the service's **Shell** tab, run:
  ```bash
  python manage.py createsuperuser        # your real admin. Use a strong password.
  python manage.py seed_demo              # optional: demo data for showing clients
  ```
- [ ] Open `https://trucksy-api.onrender.com/api/health/`. It should say `"ok": true`.
- [ ] **Cost:** the blueprint uses the always-on Starter web service plus Basic Postgres, roughly **$13/month**. Don't use the free tier for real drivers: free web services go to sleep after 15 minutes, and free databases are deleted after 30 days.
- [ ] Later, add your own domain, such as `app.trucksy.bh`. Add it under Render's **Settings → Custom domains**, then add it to `ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS` in the environment variables.

## Phase 3 — Build the Android app (Days 5–6)

- [ ] Put your real server address in `driver-app/eas.json` under both `preview` and `production`, in `EXPO_PUBLIC_API_URL`.
- [ ] Run:
  ```bash
  cd driver-app
  npx eas-cli login              # the same Expo account you used for v1
  npx eas-cli build:configure
  npm run build:apk              # builds an installable APK in the cloud (~15 min)
  ```
- [ ] Download the APK from the link, install it on two or three phones, and sign in with drivers you created in the dashboard.
- [ ] **Field test:** drive a real route with the screen **off** for 30 minutes. The dashboard map should keep updating. If it stops:
  * Check that location permission is set to **Allow all the time**.
  * Turn off battery optimisation for Trucksy. Samsung, Xiaomi and Huawei phones are aggressive about this. Your driver onboarding sheet must include this step.

> The v1 app used the package name `com.yourname.trucksydriver`. v2 uses `com.trucksy.driver`. If Trucksy owns a domain, it's even better to use it reversed, such as `bh.trucksy.driver`. Change it in `app.json` **before** the first Play Store upload, because it can never change afterwards.

## Phase 4 — Pilot with one real customer (Weeks 2–3)

Do not launch to everyone. Run a pilot.

- [ ] Choose **3–5 drivers** and **1 friendly customer**.
- [ ] Before you start, write down today's baseline numbers:
  * jobs per truck per day
  * how many "where is my truck?" phone calls the office gets
  * how many delivery disputes happen
- [ ] Hold a 15-minute driver onboarding: install the app, sign in, set **Allow all the time**, turn off battery optimisation, and do one test job.
- [ ] Send the customer the tracking link from each load (there's a **Send on WhatsApp** button).
- [ ] Every evening, check `/admin/` for jobs that got stuck at one step. That's where drivers are confused.
- [ ] After two weeks, compare against your baseline. Those numbers become your sales pitch.

## Phase 5 — Publish on Google Play (Weeks 3–5)

- [ ] Create a **Google Play Console** account. It costs a one-time **$25**.
  * Register it as an **organisation** using Trucksy's CR. New personal accounts must first run a closed test with **12 testers for 14 days** before they can publish to production.
- [ ] Run `npm run build:play`. It produces an `.aab` file.
- [ ] Prepare the store listing: the icon (already in `assets/icon.png`), 4 phone screenshots, a short and long description, and a **privacy policy URL**. The privacy policy is mandatory because the app uses location.
- [ ] Fill in the **background location declaration** and upload a short video showing the "Go online" flow. Google reviews background-location apps strictly. Our in-app permission message already explains the purpose.
- [ ] Release to the **Internal testing** track first, then Closed testing, then Production.
- [ ] iPhone drivers need an Apple Developer account at $99/year and `eas build -p ios`. Leave this until a customer asks for it, because most GCC truck drivers use Android.

## Phase 6 — Run it like a product (ongoing)

- [ ] **Backups:** check the backup and recovery options on your Render Postgres plan. Also export a copy monthly with `python manage.py dumpdata > backup.json` and store it off-server.
- [ ] **Uptime monitoring:** create a free UptimeRobot check on `/api/health/`.
- [ ] **Error tracking:** add Sentry to both Django and Expo. Each has a free tier and takes about 20 minutes to set up.
- [ ] **Over-the-air fixes:** `npx eas-cli update` pushes JavaScript fixes to drivers' phones without a new Play Store release.
- [ ] **Security:** change the admin password, never commit `.env`, and reset PINs when a driver leaves. Deleting a driver in the dashboard deactivates them and revokes their login, but keeps their job history.

---

## Roadmap — what to build next (in this order)

These are ordered by how much money each one makes or saves.

1. **Address search with Google Places.** Right now only about 16 known Bahrain locations get automatic map pins. Places autocomplete makes every address work.
2. **Photo proof of delivery and signature.** Use `expo-image-picker` plus file storage such as Cloudflare R2. This is the number one thing that ends payment disputes.
3. **Push notifications for new jobs.** Use `expo-notifications`. Drivers stop needing to watch the app.
4. **Invoicing.** Generate a PDF invoice when a job is delivered, with VAT at Bahrain's current rate and monthly statements per customer.
5. **Customer portal.** Let customers book loads themselves, instead of by phone or WhatsApp.
6. **Arabic and Urdu in the driver app.** Many drivers will prefer it.
7. **Document expiry alerts.** The licence, registration and insurance dates are already stored. Add a daily email or WhatsApp alert.
8. **Reefer temperature sensors.** The `SensorReading` table and the `/api/me/sensor/` endpoint already exist, so connect a Bluetooth or GPS temperature logger for cold-chain customers.

## The business side

**If Trucksy is your client (software-house model):**

* Charge a **setup fee** covering deployment, branding, driver onboarding and training.
* Add a **monthly fee per active truck**. GCC fleet-tracking tools typically charge per vehicle per month. Price below dedicated GPS hardware vendors, because there's no device to install: the driver's phone is the tracker.
* Keep a **support retainer** that covers hosting, updates and new features from the roadmap.
* Put the source-code ownership, hosting responsibility and data ownership in writing before you start.

**If you run Trucksy yourself (a SaaS product):**

The same product can serve any small fleet, from 5 to 50 trucks: water delivery, building materials, cold chain, movers. Your pilot results from Phase 4 are the case study. Sell on three outcomes:

* fewer "where is my truck?" calls
* proof of delivery that ends disputes
* more jobs per truck per day

**Your differentiator, in one sentence:** *"Live truck tracking and proof of delivery for GCC fleets, with no GPS hardware: your drivers' phones are the trackers."*
