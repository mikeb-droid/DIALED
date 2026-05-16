-- ============================================================
-- DIALED — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Ocean data table (stores daily SST/chlorophyll grids + derived products)
CREATE TABLE IF NOT EXISTS ocean_data (
  id          BIGSERIAL PRIMARY KEY,
  date        DATE        NOT NULL UNIQUE,  -- the chart date (YYYY-MM-DD)
  sst_date    TEXT,       -- actual satellite date (may be 3 days behind)
  chl_date    TEXT,       -- actual chlorophyll date (weekly)
  sst_grid    FLOAT[]     NOT NULL,         -- NX*NY = 36,000 SST values (°F)
  chl_grid    FLOAT[]     NOT NULL,         -- chlorophyll-a mg/m³
  depth_grid  FLOAT[]     NOT NULL,         -- depth in feet (static)
  gs_grid     FLOAT[]     NOT NULL,         -- Gulf Stream proximity 0-1
  isotherms   JSONB,      -- pre-computed isotherm line segments
  temp_breaks JSONB,      -- temperature break points
  waypoints   JSONB,      -- pre-computed species waypoints {mahi:[...], sail:[...]}
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Buoy data table (latest readings from NDBC stations)
CREATE TABLE IF NOT EXISTS buoy_data (
  id           BIGSERIAL PRIMARY KEY,
  buoy_id      TEXT        NOT NULL,
  name         TEXT,
  lat          FLOAT,
  lon          FLOAT,
  timestamp    TIMESTAMPTZ NOT NULL,
  wind_speed   FLOAT,      -- knots
  wind_dir     FLOAT,      -- degrees true
  wind_gust    FLOAT,      -- knots
  wave_height  FLOAT,      -- feet
  wave_period  FLOAT,      -- seconds
  sst          FLOAT,      -- °F
  air_temp     FLOAT,      -- °F
  pressure     FLOAT,      -- hPa
  fetched_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(buoy_id, timestamp)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_ocean_data_date     ON ocean_data (date DESC);
CREATE INDEX IF NOT EXISTS idx_buoy_data_fetched   ON buoy_data  (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_buoy_data_buoy_id   ON buoy_data  (buoy_id);

-- Row-level security (public read for anon key, write only via service key)
ALTER TABLE ocean_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE buoy_data  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read ocean_data"
  ON ocean_data FOR SELECT USING (true);

CREATE POLICY "Public can read buoy_data"
  ON buoy_data FOR SELECT USING (true);

-- Service role can write (handled by SUPABASE_SERVICE_KEY)
-- No additional policy needed — service key bypasses RLS

-- Optional: auto-cleanup old buoy data (keep last 48 hours)
-- Run this as a scheduled job or manually
-- DELETE FROM buoy_data WHERE fetched_at < NOW() - INTERVAL '48 hours';
