# DIALED — FL East Coast Offshore Fishing Chart

Real-time offshore fishing chart powered by NASA/NOAA satellite data.
Runs on Vercel (free) + Supabase (free). No credit card required.

## What it does
- **Real SST** from NASA MUR satellite (1km daily)
- **Real chlorophyll** from NOAA VIIRS (750m weekly)
- **Live buoy data** from NDBC stations updated every 30 minutes
- **NWS marine forecasts** for FL east coast offshore zones
- **GO / CAUTION / NO-GO** status based on actual conditions
- **Species hotspots** scored by SST + depth + chlorophyll + lunar phase
- **4-day forecast** from daily data pipeline
- Works on phone and desktop — installable as PWA

---

## Setup (30 minutes total)

### Step 1 — Supabase database (5 min)
1. Go to **supabase.com** → New project (free)
2. Note your **Project URL** and **anon key** from Settings → API
3. Go to **SQL Editor** → paste contents of `supabase-schema.sql` → Run

### Step 2 — GitHub repo (2 min)
```bash
git init
git add .
git commit -m "Initial DIALED setup"
git remote add origin https://github.com/YOUR_USERNAME/DIALED.git
git push -u origin main
```

### Step 3 — Vercel deploy (5 min)
1. Go to **vercel.com** → Import Git Repository → select DIALED
2. Add environment variables (Settings → Environment Variables):
   ```
   SUPABASE_URL          = https://xxxx.supabase.co
   SUPABASE_SERVICE_KEY  = eyJ...  (service_role key, NOT anon key)
   CRON_SECRET           = any-random-string-you-choose
   ```
3. Deploy

### Step 4 — Run first data fetch (2 min)
After deploy, trigger the data pipeline manually:
```
https://your-app.vercel.app/api/cron-fetch?secret=YOUR_CRON_SECRET
```
This fetches real NASA SST + NOAA chlorophyll and stores it in Supabase.
After this, the cron job runs automatically every day at 7:00 AM UTC.

### Step 5 — Open the app
```
https://your-app.vercel.app
```

**Install on iPhone:** Safari → Share → Add to Home Screen  
**Install on Android:** Chrome → menu → Install app

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/status` | Health check, data freshness |
| `GET /api/ocean` | Latest SST grid, isotherms, temp breaks |
| `GET /api/ocean?date=YYYY-MM-DD` | Ocean data for specific date |
| `GET /api/conditions` | Live buoys + marine forecast + GO status |
| `GET /api/conditions?boat=small` | GO status for small boat (under 24ft) |
| `GET /api/waypoints?fish=mahi` | Top 8 Mahi spots with scores |
| `GET /api/cron-fetch?secret=X` | Manually trigger data pipeline |

---

## Data Sources

| Data | Source | Resolution | Lag |
|---|---|---|---|
| SST | NASA MUR via NOAA ERDDAP | 1km | ~3 days |
| Chlorophyll | NOAA VIIRS ERDDAP | 750m | ~7 days |
| Buoy data | NOAA NDBC | Point stations | 30 min |
| Marine forecast | NWS weather.gov | Zone-based | 6 hours |
| Bathymetry | Hard-coded from NOAA charts | — | Static |

All data sources are **free and require no API keys**.

---

## Local development
```bash
npm install
cp .env.example .env.local
# Fill in .env.local with your Supabase credentials

npm run dev           # starts Vercel dev server at localhost:3000
npm run fetch         # manually run the data pipeline locally
```

---

## Boat size settings for GO/CAUTION/NO-GO

| Setting | Wind limit | Seas limit |
|---|---|---|
| `small` (under 24ft) | 15kt | 2ft |
| `medium` (24-32ft) | 20kt | 4ft |
| `large` (32ft+) | 25kt | 6ft |

Pass `?boat=small` to `/api/conditions` to customize.
