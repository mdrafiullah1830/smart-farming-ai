-- Operator-issued device commands (queued until the device checks in).
-- The Worker has no push channel to firmware, so it records the *desired*
-- state; the dashboard reports that state as the operator's intent rather
-- than as a sensor-confirmed fact.
CREATE TABLE IF NOT EXISTS device_commands (
  device_id TEXT PRIMARY KEY REFERENCES sensor_devices(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'off' CHECK (state IN ('on', 'off')),
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_device_commands_owner ON device_commands(owner_id, issued_at DESC);

-- Dashboard "Today's priorities" list, synced per user. Titles are stored as
-- separate bn/en columns so the API can serve either language without parsing
-- embedded JSON.
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  time TEXT,
  title_bn TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_owner_position ON tasks(owner_id, position, created_at);
