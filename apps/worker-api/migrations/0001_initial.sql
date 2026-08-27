PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  language TEXT NOT NULL DEFAULT 'bn',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE districts (
  id TEXT PRIMARY KEY,
  name_en TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  division TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL
);

CREATE TABLE upazilas (
  id TEXT PRIMARY KEY,
  district_id TEXT NOT NULL REFERENCES districts(id),
  name_en TEXT NOT NULL,
  name_bn TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  UNIQUE (district_id, name_en)
);

CREATE TABLE farms (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  district_id TEXT REFERENCES districts(id),
  upazila_id TEXT REFERENCES upazilas(id),
  latitude REAL,
  longitude REAL,
  area_acres REAL NOT NULL CHECK (area_acres > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE soil_features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district_name TEXT NOT NULL,
  upazila_name TEXT,
  feature_name TEXT NOT NULL,
  feature_value TEXT NOT NULL,
  area_ha REAL CHECK (area_ha >= 0),
  source TEXT NOT NULL DEFAULT 'BARC',
  source_year INTEGER
);

CREATE TABLE crops (
  id TEXT PRIMARY KEY,
  name_en TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  season TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE market_prices (
  id TEXT PRIMARY KEY,
  crop_id TEXT NOT NULL REFERENCES crops(id),
  district_id TEXT REFERENCES districts(id),
  market_name TEXT,
  price_min REAL NOT NULL,
  price_max REAL NOT NULL,
  unit TEXT NOT NULL,
  source TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  CHECK (price_min >= 0 AND price_max >= price_min)
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE uploaded_files (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ai_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id TEXT REFERENCES uploaded_files(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  result_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX idx_upazilas_district ON upazilas(district_id);
CREATE INDEX idx_farms_owner ON farms(owner_id);
CREATE INDEX idx_soil_location ON soil_features(district_name, upazila_name);
CREATE INDEX idx_soil_feature ON soil_features(feature_name);
CREATE INDEX idx_market_crop_date ON market_prices(crop_id, recorded_at);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at);
CREATE INDEX idx_ai_jobs_user ON ai_jobs(user_id, created_at);
