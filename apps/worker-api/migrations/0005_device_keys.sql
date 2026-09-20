-- ---------------------------------------------------------------------------
-- 0005_device_keys.sql
--
-- Device authentication for the Smart Soil Analyzer hardware.
--
-- Until now `POST /api/v1/sensors/readings` required a *user* JWT, which an
-- ESP32 cannot obtain or refresh. A field device needs a long-lived, revocable
-- credential that is scoped to a single device and to write-only ingestion.
--
-- Design
--   * A device key is a single secret string: `sfa_<device_id>_<random>`.
--     Only the SHA-256 hash is stored, so a D1 leak does not expose keys.
--   * `device_keys.device_id` is the join to `sensor_devices.id`. The device
--     row is created by the pairing endpoint, never by the firmware itself.
--   * `scope` is reserved for future read-only keys (`read`) versus the default
--     write-only ingestion key (`ingest`).
--   * Revocation is soft (`revoked_at`) so `last_used_at` history survives.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS device_keys (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES sensor_devices(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'default',
  scope TEXT NOT NULL DEFAULT 'ingest' CHECK (scope IN ('ingest', 'read')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_device_keys_device ON device_keys(device_id);
CREATE INDEX IF NOT EXISTS idx_device_keys_owner ON device_keys(owner_id);
CREATE INDEX IF NOT EXISTS idx_device_keys_hash ON device_keys(key_hash);

-- Pairing codes let a farmer claim a device without typing a 64-char key.
-- The firmware prints the code on the serial console / LCD; the farmer enters
-- it in the dashboard while logged in, and the Worker mints a device key.
CREATE TABLE IF NOT EXISTS device_pairing_codes (
  code TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES sensor_devices(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pairing_codes_device ON device_pairing_codes(device_id);
CREATE INDEX IF NOT EXISTS idx_pairing_codes_expires ON device_pairing_codes(expires_at);

-- Advisory thresholds are per-device because probe calibration and crop choice
-- change what counts as "too dry". Values are percentages for moisture and
-- degrees Celsius for temperature, matching the sensor_readings columns.
CREATE TABLE IF NOT EXISTS device_thresholds (
  device_id TEXT PRIMARY KEY REFERENCES sensor_devices(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  moisture_min_percent REAL NOT NULL DEFAULT 25,
  moisture_max_percent REAL NOT NULL DEFAULT 80,
  soil_temp_min_c REAL NOT NULL DEFAULT 12,
  soil_temp_max_c REAL NOT NULL DEFAULT 38,
  battery_min_percent REAL NOT NULL DEFAULT 20,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One row per fired advisory, so the dashboard can show a history and the
-- Worker can avoid repeating the same alert on every reading.
CREATE TABLE IF NOT EXISTS sensor_alerts (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES sensor_devices(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reading_id TEXT REFERENCES sensor_readings(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  message_en TEXT NOT NULL,
  message_bn TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sensor_alerts_device_time ON sensor_alerts(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_alerts_owner_time ON sensor_alerts(owner_id, created_at DESC);
