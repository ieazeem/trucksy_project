# Trucksy v2

Trucking dispatch platform for Bahrain and the GCC, in three parts:

| Part | Who uses it | Tech | Folder |
|---|---|---|---|
| **Dispatch console** | Office / ops team | Django templates + vanilla JS + Leaflet map | `backend/templates`, `backend/static` |
| **API + database** | Everything talks to it | Django 5.2, Django REST Framework, Postgres (SQLite locally) | `backend/` |
| **Trucksy Driver app** | Drivers (Android / iOS) | Expo SDK 54, React Native, Expo Router | `driver-app/` |
| **Customer tracking page** | Your customers (no login) | `/t/<code>/`, shared by link or WhatsApp | `backend/templates/dashboard/track.html` |
| **Public website** | Customers and prospects | Static HTML on Netlify, with a quote form (Netlify Forms) and tracking lookup | `website/` |

![Dispatch console](docs/screenshots/overview.png)

---

## Try the dashboard without installing anything

Open **`demo/trucksy-dashboard-demo.html`** in any browser by double-clicking it. It's the real dashboard running against an in-browser demo server with Bahrain sample data, and the trucks move by themselves. Rebuild it after changing the dashboard with `python demo/build_demo.py`.

## Run it on your laptop (10 minutes)

You need **Python 3.12+** and **Node 20+**.

### 1. Backend + dashboard

```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate      Mac/Linux:  source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env          # Mac/Linux: cp .env.example .env
python manage.py migrate
python manage.py seed_demo      # demo trucks, drivers and loads around Bahrain
python manage.py runserver 0.0.0.0:8000
```

Open **http://localhost:8000** and sign in with `admin` / `trucksy123`.

To make the trucks move on the map during a demo, open a second terminal and run:

```bash
python manage.py simulate_drivers
```

Run the tests with `python manage.py test`. All 15 should pass.

### 2. Driver app

```bash
cd driver-app
npm install
npx expo start
```

* **Quickest test:** press `w` to open the app in your browser.
* **On your phone:** the app uses background location, which Expo Go doesn't support. Build a development app once with `npx eas-cli build -p android --profile development`, install it, then run `npx expo start --dev-client`.
* On the login screen, tap **Server settings** and enter your laptop's Wi-Fi address, for example `http://192.168.1.10:8000`. Find it with `ipconfig` (Windows) or `ifconfig` (Mac).

Demo driver login: phone **34180130**, PIN **1234** (Yasir Ali).

---

## Website (trucksy.netlify.app)

The marketing site lives in `website/`. It's plain HTML and CSS with no build step.

* **Quote form:** submissions arrive in Netlify under **Forms → quote**. Turn on email notifications under **Site configuration → Notifications → Form submission notifications**.
* **Track a delivery:** the customer pastes their tracking code or link and is sent to `TRUCKSY_APP_URL/t/<code>/`.
* **Staff login:** the footer link goes to `TRUCKSY_APP_URL/login/`.
* After the backend is on Render, set `TRUCKSY_APP_URL` near the bottom of `website/index.html` to the Render address.

**Deploy:** in Netlify go to **Site configuration → Build & deploy → Link repository**, choose `ieazeem/trucksy_project`, and set **Base directory** to `website`. Every push to `main` then updates the site. For a one-off deploy instead, drag the `website` folder onto **Deploys** in Netlify.

The website, dashboard, tracking page and driver app share one theme: dark grey `#262626`, panels `#333333`, black buttons, and emerald green `#34D399`.

## How a job flows

```
Dispatcher creates load ─► assigns driver ─► driver app shows "Your job"
      │                                              │
      │        Start driving ─► Goods loaded ─► Leave for drop-off ─► Mark as delivered (receiver name)
      │                                              │
      └── live map, road strip and activity log ◄────┘ GPS every 15 s or 50 m, including with the screen off
                     │
                     └─► customer tracking link (/t/<code>/) and WhatsApp share
```

## API summary

| Endpoint | Who | What it does |
|---|---|---|
| `POST /api/auth/driver/login/` | Driver | Phone and PIN in, token out |
| `GET /api/me/` | Driver | Profile, current job, today's stats |
| `POST /api/me/status/` | Driver | Go online, offline or on break |
| `POST /api/me/location/` | Driver | Send one GPS point, or a batch with `{"points":[...]}` |
| `GET /api/me/loads/` | Driver | Active jobs and history |
| `POST /api/me/loads/<id>/advance/` | Driver | Move a job to its next step (steps can't be skipped) |
| `GET /api/dashboard/` | Dispatcher | KPIs, live drivers, active loads, activity feed |
| `/api/loads/`, `/api/drivers/`, `/api/trucks/` | Dispatcher | Create, read, update and delete |
| `POST /api/loads/<id>/set_status/` | Dispatcher | Manual override, such as cancelling a load |
| `GET /api/public/track/<code>/` | Anyone | Customer-safe tracking data (no prices) |
| `GET /api/drivers/<id>/history/?from=&to=` | Dispatcher | Route trail, km driven and deliveries for a date range |
| `GET /api/reports/operations.xlsx?from=&to=` | Dispatcher | Management report: Summary, Daily, Loads, Drivers, Fleet |
| `GET /api/reports/loads.xlsx?from=&to=&status=&q=` | Dispatcher | Exactly what the Loads tab shows |
| `GET /api/reports/drivers.xlsx` | Dispatcher | Driver list with documents, trucks and performance |
| `GET /api/reports/drivers/<id>/route.xlsx?from=&to=` | Dispatcher | One driver's route: summary, deliveries, every GPS point |
| `GET /api/health/` | Anyone | Uptime check |

Drivers authenticate with `Authorization: Token <token>`. Dispatchers are Django **staff** users; create one with `python manage.py createsuperuser`.

## Excel reports

Every export button in the dashboard downloads a formatted `.xlsx`. The header row is frozen, filters are switched on, money is shown in BHD with 3 decimals, times are in Bahrain time, and totals are live Excel formulas.

* **Live map → Download weekly report.** The last 7 days across five tabs: Summary, Daily, Loads, Drivers and Fleet.
* **Loads → Download Excel.** Respects the status filter, the search box and the From/To pickup dates.
* **Drivers → Download driver list.** Documents and expiry dates, trucks, last position, and deliveries, revenue and km for the last 30 days.
* **Drivers → Route history.** Pick any date range to see the route on a map with km driven, first and last signal, and deliveries. **Download Excel** gives every GPS point with a Google Maps link.

## What changed from v1

* v2 is a clean rebuild. The original v1 code is kept unchanged in `legacy/v1/`.
* v1's two best features are kept and upgraded: the Excel export, now with five report types, and driver history by date range, now with a map, km driven and an Excel download.
* The API address no longer points at a temporary ngrok URL. It's set at build time in `eas.json`, and can be overridden from the login screen.
* Fixed the field mismatch that broke driver registration (`cpr`/`license_number` vs `truck_id`).
* Merged the two location tables and the two sensor tables into one `LocationPing` and one `SensorReading`.
* Added real login (phone + PIN, then a token). Drivers can only see and update their own jobs.
* Added background GPS with an Android foreground notification, plus an offline queue for points sent without signal.
* Added the job lifecycle with an audit trail, proof of delivery and a public tracking page.
* Removed the Expo template leftovers and the placeholder package name. The app ID is now `com.trucksy.driver`.
* Production-ready settings: environment variables, Postgres, WhiteNoise, HTTPS, Render blueprint.

See **LAUNCH_GUIDE.md** for the step-by-step path to going live.

---

## Legacy v1

The original v1 code (`transprot_app`, May 2026) is preserved unchanged in [`legacy/v1/`](legacy/v1/) for reference. It is not used by v2.
