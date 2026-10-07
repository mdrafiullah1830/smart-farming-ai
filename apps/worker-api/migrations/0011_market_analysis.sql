-- ---------------------------------------------------------------------------
-- 0011_market_analysis.sql
--
-- Market Analysis feature: dynamic Bangladesh agricultural & food market price
-- analysis with multi-source collection, trust scoring, freshness evaluation,
-- and extensible commodity catalog.
--
-- Design notes:
-- * Source configuration is data-driven; new sources added via INSERT only.
-- * Commodity catalog is extensible; categories, aliases, units defined per commodity.
-- * Price records are transient cache entries; not authoritative market data.
-- * Trust scores are system-generated indicators, not scientific truth.
-- * Freshness thresholds are configurable via source config.
-- ---------------------------------------------------------------------------

-- Commodity catalog: extensible list of agricultural/food products
CREATE TABLE IF NOT EXISTS market_commodities (
  id TEXT PRIMARY KEY,                    -- e.g., 'potato', 'rice_aman', 'hilsa'
  name_en TEXT NOT NULL,                  -- English name
  name_bn TEXT NOT NULL,                  -- Bengali name
  aliases_json TEXT NOT NULL DEFAULT '[]', -- JSON array of alternative names (en/bn)
  category TEXT NOT NULL,                 -- e.g., 'Vegetables', 'Rice & Grains', 'Fish'
  default_unit TEXT NOT NULL DEFAULT 'kg', -- Default unit for this commodity
  valid_units_json TEXT NOT NULL DEFAULT '["kg"]', -- JSON array of valid units
  season TEXT,                            -- Optional: 'rabi', 'kharif', 'all'
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_commodities_category ON market_commodities(category);
CREATE INDEX IF NOT EXISTS idx_commodities_active ON market_commodities(is_active);

-- Source configuration: pluggable data sources
CREATE TABLE IF NOT EXISTS market_sources (
  id TEXT PRIMARY KEY,                    -- e.g., 'dam_gov', 'prothom_alo', 'bbs_gov'
  name_en TEXT NOT NULL,
  name_bn TEXT NOT NULL,
  source_type TEXT NOT NULL,              -- 'government', 'news', 'agricultural_authority', 'other'
  base_url TEXT NOT NULL,
  parser_type TEXT NOT NULL,              -- 'html_table', 'json_api', 'csv', 'rss'
  trust_tier INTEGER NOT NULL DEFAULT 4 CHECK (trust_tier BETWEEN 1 AND 4),
  -- Tier 1: Official government source
  -- Tier 2: Official agricultural/market authority
  -- Tier 3: Established verified news organization
  -- Tier 4: Other reputable public source
  update_frequency_hours INTEGER NOT NULL DEFAULT 24,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  region TEXT,                            -- Optional: specific division/district
  supported_categories_json TEXT NOT NULL DEFAULT '[]', -- JSON array of categories
  parser_config_json TEXT NOT NULL DEFAULT '{}', -- Parser-specific configuration
  rate_limit_rps REAL NOT NULL DEFAULT 0.5, -- Requests per second (0.5 = 1 per 2s)
  timeout_ms INTEGER NOT NULL DEFAULT 10000,
  user_agent TEXT,
  headers_json TEXT NOT NULL DEFAULT '{}', -- Additional headers
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sources_enabled ON market_sources(enabled);
CREATE INDEX IF NOT EXISTS idx_sources_trust ON market_sources(trust_tier);

-- Normalized price records (cached/processed from sources)
CREATE TABLE IF NOT EXISTS market_price_records (
  id TEXT PRIMARY KEY,                    -- UUID
  commodity_id TEXT NOT NULL REFERENCES market_commodities(id),
  normalized_name TEXT NOT NULL,          -- Normalized product name
  category TEXT NOT NULL,
  price_min REAL NOT NULL,
  price_max REAL NOT NULL,
  price_avg REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BDT',
  unit TEXT NOT NULL,
  market_name TEXT,                       -- Market name if available
  district_id TEXT REFERENCES districts(id),
  division TEXT,                          -- Division name
  source_id TEXT NOT NULL REFERENCES market_sources(id),
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  -- Provenance snapshot: how this row was judged when it was written. A
  -- source can be re-tiered later, and a stored row must keep saying what it
  -- was assessed against rather than being silently re-scored by history.
  trust_tier INTEGER NOT NULL DEFAULT 4,
  unit_published INTEGER NOT NULL DEFAULT 0 CHECK (unit_published IN (0, 1)),
  published_at TEXT,                      -- Source publication timestamp
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_age_hours REAL,                    -- Hours since published_at
  verification_status TEXT NOT NULL,      -- 'verified', 'unverified', 'disputed'
  confidence_score REAL NOT NULL,         -- 0-100 system-generated indicator
  parser_version TEXT NOT NULL DEFAULT '1.0',
  raw_data_json TEXT,                     -- Optional: original extracted data for debugging
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_price_commodity ON market_price_records(commodity_id);
CREATE INDEX IF NOT EXISTS idx_price_source ON market_price_records(source_id);
CREATE INDEX IF NOT EXISTS idx_price_fetched ON market_price_records(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_district ON market_price_records(district_id);
CREATE INDEX IF NOT EXISTS idx_price_category ON market_price_records(category);
CREATE INDEX IF NOT EXISTS idx_price_verification ON market_price_records(verification_status);

-- Aggregated prices (combined from multiple sources)
CREATE TABLE IF NOT EXISTS market_aggregated_prices (
  id TEXT PRIMARY KEY,                    -- UUID
  commodity_id TEXT NOT NULL REFERENCES market_commodities(id),
  normalized_name TEXT NOT NULL,
  category TEXT NOT NULL,
  price_min REAL NOT NULL,
  price_max REAL NOT NULL,
  price_avg REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BDT',
  unit TEXT NOT NULL,
  market_name TEXT,
  district_id TEXT REFERENCES districts(id),
  division TEXT,
  source_count INTEGER NOT NULL,          -- Number of sources contributing
  sources_json TEXT NOT NULL,             -- JSON array of contributing source IDs
  price_variation_pct REAL,               -- (max-min)/avg * 100
  has_disagreement INTEGER NOT NULL DEFAULT 0 CHECK (has_disagreement IN (0, 1)),
  overall_confidence REAL NOT NULL,       -- Weighted confidence from sources
  overall_freshness TEXT NOT NULL,        -- 'very_fresh', 'fresh', 'recent', 'aged', 'outdated'
  aggregated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,               -- When this aggregation should be refreshed
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agg_commodity ON market_aggregated_prices(commodity_id);
CREATE INDEX IF NOT EXISTS idx_agg_district ON market_aggregated_prices(district_id);
CREATE INDEX IF NOT EXISTS idx_agg_expires ON market_aggregated_prices(expires_at);
CREATE INDEX IF NOT EXISTS idx_agg_category ON market_aggregated_prices(category);

-- Source fetch logs for monitoring
CREATE TABLE IF NOT EXISTS market_source_logs (
  id TEXT PRIMARY KEY,                    -- UUID
  source_id TEXT NOT NULL REFERENCES market_sources(id),
  status TEXT NOT NULL,                   -- 'success', 'failed', 'partial'
  http_status INTEGER,
  records_extracted INTEGER NOT NULL DEFAULT 0,
  records_valid INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logs_source ON market_source_logs(source_id);
CREATE INDEX IF NOT EXISTS idx_logs_fetched ON market_source_logs(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_status ON market_source_logs(status);

-- Freshness configuration (configurable thresholds)
CREATE TABLE IF NOT EXISTS market_freshness_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  very_fresh_hours REAL NOT NULL DEFAULT 1,
  fresh_hours REAL NOT NULL DEFAULT 6,
  recent_hours REAL NOT NULL DEFAULT 24,
  aged_hours REAL NOT NULL DEFAULT 72,
  outdated_hours REAL NOT NULL DEFAULT 168, -- 1 week
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert default freshness config
INSERT OR IGNORE INTO market_freshness_config (id) VALUES ('default');