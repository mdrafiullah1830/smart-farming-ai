-- ---------------------------------------------------------------------------
-- 0009_flood_resilience.sql
--
-- Flood & Climate Resilience Engine. Bangladesh loses crops to flooding every
-- monsoon, and the decision a farmer actually faces is narrow and time-bound:
-- *should I move this standing crop, and how many days do I have to decide?*
-- This stores the two things that answer it -- the flood-plain areas a district
-- actually floods, and each farmer's own exposure to them -- so the engine can
-- compute a risk score and a deadline rather than showing a generic warning.
--
-- Design notes:
--  * Risk is not stored. It is computed per request from the exposure rows plus
--    live rainfall, because a risk number that outlives the forecast it came
--    from is worse than no number at all. What is stored is only what the
--    farmer controls or what is static geography.
--  * `flood_depth_m` and `flood_duration_days` are the observed/estimated
--    characteristics of an area, NOT the crop. Checked non-negative so a bad
--    import cannot produce a negative risk contribution.
--  * `seasons` is a TEXT list, not a second table: a farmer harvests in a
--    season or does not, and there is no per-season metadata to store. Kept as
--    a comma-separated string so one row per farm covers the whole year.
--  * action_taken records what the farmer ACTUALLY did, which is what turns an
--    advice feature into something measurable: hit-rate analysis over time is
--    the only honest way to know whether the risk scores are worth anything.
--  * Money is integer taka for the same reason as the marketplace: D1 has no
--    decimal type, and floating point taka is not acceptable in a loss claim.
-- ---------------------------------------------------------------------------

-- Areas that flood, per district. This is the static geography half of the
-- risk calculation: how deep, how long, and during which crop seasons.
CREATE TABLE IF NOT EXISTS flood_zones (
  id TEXT PRIMARY KEY,
  district_id TEXT NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  upazila_id TEXT REFERENCES upazilas(id) ON DELETE SET NULL,
  name_en TEXT NOT NULL,
  name_bn TEXT NOT NULL DEFAULT '',
  -- Typical peak depth in metres. 0 = waterlogged but not a standing flood.
  flood_depth_m REAL NOT NULL CHECK (flood_depth_m >= 0),
  -- Typical how long the area stays under water, which is what decides whether
  -- a transplanted crop survives at all.
  flood_duration_days INTEGER NOT NULL DEFAULT 0 CHECK (flood_duration_days >= 0),
  -- Comma-separated crop seasons this floods in, e.g. 'boro,aman'.
  -- Empty means "any season".
  flood_seasons TEXT NOT NULL DEFAULT '',
  -- Free text: 'haor basin', 'embankment-protected', etc.
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The district-level rollup ("how exposed is Sylhet overall") is a scan.
CREATE INDEX IF NOT EXISTS idx_flood_zones_district ON flood_zones(district_id);

-- What a farmer actually has standing in a flooding area. This is the farmer's
-- half of the calculation, and the unit of loss in an insurance claim.
CREATE TABLE IF NOT EXISTS flood_exposures (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farm_id TEXT REFERENCES farms(id) ON DELETE CASCADE,
  zone_id TEXT NOT NULL REFERENCES flood_zones(id) ON DELETE CASCADE,
  crop_name_en TEXT NOT NULL,
  crop_name_bn TEXT NOT NULL DEFAULT '',
  area_acres REAL NOT NULL CHECK (area_acres > 0),
  -- The crop is planted on this date; lead time to a flood is measured from here.
  planted_on TEXT,
  -- Comma-separated seasons, mirroring flood_zones.flood_seasons.
  seasons TEXT NOT NULL DEFAULT '',
  -- Expected value of the standing crop, in whole taka. Used for the loss
  -- estimate; null when the farmer has not entered it.
  crop_value_taka INTEGER CHECK (crop_value_taka IS NULL OR crop_value_taka >= 0),
  -- 1 = flood-prone, 2 = precautionary, 3 = normal drainage.
  drainage_class INTEGER NOT NULL DEFAULT 2
    CHECK (drainage_class BETWEEN 1 AND 3),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- "What am I exposed to right now" -- the farmer's own list, newest first.
CREATE INDEX IF NOT EXISTS idx_flood_exposures_user ON flood_exposures(user_id, created_at DESC);
-- Same question asked per farm, so a multi-farm farmer sees each separately.
CREATE INDEX IF NOT EXISTS idx_flood_exposures_farm ON flood_exposures(farm_id, created_at DESC);

-- What the farmer did about a warning. Append-only on purpose: overwriting this
-- would erase the only record of whether acting on advice ever helped.
CREATE TABLE IF NOT EXISTS flood_actions (
  id TEXT PRIMARY KEY,
  exposure_id TEXT NOT NULL REFERENCES flood_exposures(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- none     = watched, changed nothing
  -- early    = harvested before the water came
  -- relocated= moved the crop to higher ground
  -- drained   = pumped/drained the plot
  -- lost     = the crop was flooded
  action TEXT NOT NULL
    CHECK (action IN ('none', 'early', 'relocated', 'drained', 'lost')),
  risk_level_at_action TEXT NOT NULL DEFAULT ''
    CHECK (risk_level_at_action IN ('low', 'moderate', 'high', 'severe', '')),
  -- Whole taka actually lost, for the loss ledger.
  loss_taka INTEGER CHECK (loss_taka IS NULL OR loss_taka >= 0),
  note TEXT,
  acted_on TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_flood_actions_exposure ON flood_actions(exposure_id, acted_on DESC);
CREATE INDEX IF NOT EXISTS idx_flood_actions_user ON flood_actions(user_id, acted_on DESC);