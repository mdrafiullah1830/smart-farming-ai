-- ---------------------------------------------------------------------------
-- 0010_irrigation.sql
--
-- Irrigation & Water Management. The existing irrigation switch can turn a
-- pump on and off, which is remote control, not water management. What a farmer
-- actually needs answered is three questions the switch cannot answer:
--
--   * Does this field need water right now?  (crop stage + soil moisture)
--   * How much, and for how long?              (litres per day, not "on")
--   * What did I use last season, and is it going up?  (usage and cost)
--
-- Design notes:
--  * `device_commands` (migration 0007) has `device_id` as its PRIMARY KEY, so
--    it holds one row per device and is overwritten every time a command is
--    issued. There is no record of what was run or for how long. This adds
--    `irrigation_events` as append-only history rather than altering 0007 --
--    changing a table that firmware and existing rows already depend on is a
--    larger risk than adding a table.
--  * Litres are INTEGER. D1 has no decimal type and a decimal litre is not a
--    real measurement, it is a rounding artefact. Cost is integer taka for the
--    same reason as the marketplace, where fractional taka is not acceptable.
--  * The requirement rows are advisory, not measured: crop-stage and season
--    figures from published Bangladesh agriculture sources, rounded to whole
--    millimetres per day.
--  * A schedule stores a local wall-clock time, not an instant. "Irrigate at
--    06:00" is a recurring intent; storing an epoch would make it meaningless
--    the next day.
-- ---------------------------------------------------------------------------

-- What each crop stage needs, per district. Seeded in 0010b.
CREATE TABLE IF NOT EXISTS water_requirements (
  id TEXT PRIMARY KEY,
  -- NULL means the figure applies to every district not listed separately.
  district_id TEXT REFERENCES districts(id) ON DELETE CASCADE,
  crop_name_en TEXT NOT NULL,
  crop_name_bn TEXT NOT NULL DEFAULT '',
  -- boro (winter rice), aman (monsoon), aus (autumn), or a non-rice crop.
  season TEXT NOT NULL CHECK (season IN ('boro', 'aman', 'aus', 'other')),
  stage TEXT NOT NULL,
  -- Millimetres of water per day for this crop at this stage here.
  mm_per_day REAL NOT NULL CHECK (mm_per_day > 0),
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Several rows per (district, crop, season, stage) would be ambiguous, so the
-- combination is unique. IFNULL folds the NULL district into a single group.
CREATE UNIQUE INDEX IF NOT EXISTS idx_water_req_unique
  ON water_requirements(IFNULL(district_id, '*'), crop_name_en, season, stage);

-- What was actually run. Append-only: overwriting this would destroy the only
-- evidence of how much water the farm actually used.
CREATE TABLE IF NOT EXISTS irrigation_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT REFERENCES sensor_devices(id) ON DELETE SET NULL,
  -- 'manual' from the switch, 'scheduled' from irrigation_schedules.
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'scheduled', 'auto')),
  crop_name_en TEXT,
  season TEXT CHECK (season IN ('boro', 'aman', 'aus', 'other')),
  -- Integer litres. NULL for an "on" command whose run has not been confirmed,
  -- which is different from a confirmed run of zero.
  volume_litres INTEGER CHECK (volume_litres IS NULL OR volume_litres >= 0),
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  -- Whole taka. NULL when the farmer has not set a rate.
  cost_taka INTEGER CHECK (cost_taka IS NULL OR cost_taka >= 0),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_irrigation_events_owner ON irrigation_events(owner_id, started_at DESC);
-- Recurring intent: "irrigate this field at 06:00".
CREATE TABLE IF NOT EXISTS irrigation_schedules (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  crop_name_en TEXT,
  season TEXT CHECK (season IN ('boro', 'aman', 'aus', 'other')),
  -- Local wall-clock, 'HH:MM'. The GLOB check is in storage because a schedule
  -- reading "99:99" would never fire, and the farmer would not find out.
  start_time TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  -- 1 = daily, 3 = every third day. Farmers sharing one pump across several
  -- fields irrigate on a rotation, so a daily-only model is wrong for them.
  interval_days INTEGER NOT NULL DEFAULT 1
    CHECK (interval_days BETWEEN 1 AND 30),
  -- Litres per run, whole number.
  target_litres INTEGER CHECK (target_litres IS NULL OR target_litres >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_irrigation_schedules_owner ON irrigation_schedules(owner_id, active, start_time);

-- What a litre costs this farm. Stored so the usage summary can report spend
-- without asking again: a diesel pump and a solar pump differ by an order of
-- magnitude, and one stored rate is not right for both.
CREATE TABLE IF NOT EXISTS irrigation_settings (
  owner_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Whole taka per 1000 litres, which is how pump fuel is actually bought.
  cost_per_1000l_taka INTEGER CHECK (cost_per_1000l_taka IS NULL OR cost_per_1000l_taka >= 0),
  pump_type TEXT NOT NULL DEFAULT 'diesel'
    CHECK (pump_type IN ('diesel', 'solar', 'electric', 'manual')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_irrigation_events_device ON irrigation_events(device_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_irrigation_events_season ON irrigation_events(owner_id, season, started_at DESC);