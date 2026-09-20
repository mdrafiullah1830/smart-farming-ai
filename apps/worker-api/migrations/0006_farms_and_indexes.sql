-- ---------------------------------------------------------------------------
-- 0006_farms_and_indexes.sql
--
-- 1. `users.google_sub` lets the dashboard's existing "Sign in with Google"
--    button resolve to a real account. Google's `sub` claim is the stable
--    identifier; email alone is not safe because users can change it.
-- 2. A local `saved_locations` table backs the district/upazila/union hierarchy
--    that `/api/v1/locations/*` serves, so those routes stop depending on
--    GitHub-hosted JSON.
-- 3. `dataset_imports` records every dataset load with its source file hash so
--    re-running the importer is idempotent and auditable.
-- 4. Indexes for the newly imported market/fertilizer/calendar lookups.
-- ---------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;

CREATE TABLE IF NOT EXISTS saved_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  division TEXT NOT NULL,
  zilla TEXT NOT NULL,
  upazila TEXT,
  union_name TEXT,
  latitude REAL,
  longitude REAL,
  UNIQUE (division, zilla, upazila, union_name)
);

CREATE INDEX IF NOT EXISTS idx_saved_locations_division ON saved_locations(division);
CREATE INDEX IF NOT EXISTS idx_saved_locations_zilla ON saved_locations(zilla);

-- Imported reference tables. These mirror the CSVs in `datasets/` exactly so a
-- Worker query is a straight SELECT instead of an HTTP fetch to GitHub.
CREATE TABLE IF NOT EXISTS market_prices_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crop_key TEXT NOT NULL,
  label_bn TEXT NOT NULL,
  price_min REAL NOT NULL,
  price_max REAL NOT NULL,
  price_mid REAL,
  change_pct REAL,
  unit TEXT NOT NULL DEFAULT 'kg',
  recorded_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'DAM',
  UNIQUE (crop_key, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_market_daily_crop_date ON market_prices_daily(crop_key, recorded_at DESC);

CREATE TABLE IF NOT EXISTS crop_calendar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crop TEXT NOT NULL,
  region TEXT NOT NULL,
  season TEXT NOT NULL,
  sowing_start TEXT,
  sowing_end TEXT,
  harvest_start TEXT,
  harvest_end TEXT,
  seed_kg_per_acre TEXT,
  notes TEXT,
  source TEXT,
  UNIQUE (crop, region, season)
);

CREATE INDEX IF NOT EXISTS idx_crop_calendar_crop ON crop_calendar(crop);

CREATE TABLE IF NOT EXISTS fertilizer_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crop TEXT NOT NULL,
  season TEXT NOT NULL,
  soil_type TEXT NOT NULL,
  n_kg_per_acre REAL,
  p_kg_per_acre REAL,
  k_kg_per_acre REAL,
  s_kg_per_acre REAL,
  zn_kg_per_acre REAL,
  notes TEXT,
  source TEXT,
  UNIQUE (crop, season, soil_type)
);

CREATE INDEX IF NOT EXISTS idx_fertilizer_crop ON fertilizer_recommendations(crop);

CREATE TABLE IF NOT EXISTS groundwater_depth (
  district TEXT PRIMARY KEY,
  division TEXT,
  depth_m REAL NOT NULL,
  stress_level TEXT,
  notes TEXT,
  source TEXT
);

CREATE TABLE IF NOT EXISTS district_census (
  district TEXT PRIMARY KEY,
  division TEXT,
  farmers_registered INTEGER,
  farms_registered INTEGER,
  total_area_acre REAL,
  avg_farm_size_acre REAL,
  source TEXT
);

CREATE TABLE IF NOT EXISTS dataset_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset TEXT NOT NULL,
  source_file TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (dataset, source_file, content_hash)
);
