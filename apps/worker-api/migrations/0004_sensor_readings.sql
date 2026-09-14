CREATE TABLE IF NOT EXISTS sensor_devices (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  firmware_version TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS sensor_readings (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES sensor_devices(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recorded_at TEXT NOT NULL,
  moisture_raw REAL NOT NULL,
  moisture_percent REAL CHECK (moisture_percent BETWEEN 0 AND 100),
  soil_temperature_c REAL,
  air_temperature_c REAL,
  air_humidity_percent REAL CHECK (air_humidity_percent BETWEEN 0 AND 100),
  battery_percent REAL CHECK (battery_percent BETWEEN 0 AND 100),
  latitude REAL,
  longitude REAL,
  soil_depth_cm REAL,
  crop TEXT,
  calibration_version TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_time ON sensor_readings(device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_owner_time ON sensor_readings(owner_id, recorded_at DESC);
