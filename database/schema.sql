-- Smart Farming AI Platform Bangladesh - Complete Database Schema
-- PostgreSQL 15+ with PostGIS for geospatial data

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- ============================================================
-- DISTRICTS TABLE
-- ============================================================
CREATE TABLE districts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    name_bn VARCHAR(100) NOT NULL,
    division VARCHAR(100) NOT NULL,
    division_bn VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    area_sq_km DECIMAL(10, 2),
    population BIGINT,
    agricultural_land_pct DECIMAL(5, 2),
    soil_type VARCHAR(100),
    climate_zone VARCHAR(100),
    major_crops TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_districts_name ON districts(name);
CREATE INDEX idx_districts_division ON districts(division);
CREATE INDEX idx_districts_location ON districts USING GIST (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));

-- ============================================================
-- FARMERS TABLE
-- ============================================================
CREATE TABLE farmers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    national_id VARCHAR(20) UNIQUE,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255),
    full_name VARCHAR(200) NOT NULL,
    full_name_bn VARCHAR(200) NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(20),
    district_id UUID REFERENCES districts(id),
    upazila VARCHAR(100),
    union VARCHAR(100),
    village VARCHAR(100),
    address TEXT,
    profile_image_url TEXT,
    language_preference VARCHAR(10) DEFAULT 'bn',
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    role VARCHAR(20) DEFAULT 'farmer' CHECK (role IN ('farmer', 'expert', 'admin', 'government')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_farmers_phone ON farmers(phone);
CREATE INDEX idx_farmers_national_id ON farmers(national_id);
CREATE INDEX idx_farmers_district ON farmers(district_id);
CREATE INDEX idx_farmers_role ON farmers(role);

-- ============================================================
-- FARMS TABLE
-- ============================================================
CREATE TABLE farms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    name_bn VARCHAR(200),
    district_id UUID REFERENCES districts(id),
    upazila VARCHAR(100),
    union VARCHAR(100),
    village VARCHAR(100),
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    boundary GEOMETRY(POLYGON, 4326),
    area_acres DECIMAL(10, 4) NOT NULL,
    soil_type VARCHAR(100),
    irrigation_type VARCHAR(100),
    water_source VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_farms_farmer ON farms(farmer_id);
CREATE INDEX idx_farms_district ON farms(district_id);
CREATE INDEX idx_farms_location ON farms USING GIST (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));

-- ============================================================
-- CROPS TABLE
-- ============================================================
CREATE TABLE crops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    name_bn VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    growing_season VARCHAR(50) NOT NULL,
    min_temp DECIMAL(5, 2),
    max_temp DECIMAL(5, 2),
    min_rainfall_mm DECIMAL(8, 2),
    max_rainfall_mm DECIMAL(8, 2),
    min_ph DECIMAL(4, 2),
    max_ph DECIMAL(4, 2),
    growth_duration_days INT,
    water_requirement_mm DECIMAL(8, 2),
    avg_yield_per_acre DECIMAL(10, 4),
    avg_price_per_kg DECIMAL(10, 2),
    image_url TEXT,
    description TEXT,
    description_bn TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_crops_name ON crops(name);
CREATE INDEX idx_crops_category ON crops(category);
CREATE INDEX idx_crops_season ON crops(growing_season);

-- ============================================================
-- SOIL REPORTS TABLE
-- ============================================================
CREATE TABLE soil_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    farmer_id UUID NOT NULL REFERENCES farmers(id),
    ph_level DECIMAL(4, 2) NOT NULL,
    nitrogen_mg_kg DECIMAL(8, 2),
    phosphorus_mg_kg DECIMAL(8, 2),
    potassium_mg_kg DECIMAL(8, 2),
    organic_matter_pct DECIMAL(5, 2),
    moisture_pct DECIMAL(5, 2),
    electrical_conductivity DECIMAL(6, 3),
    soil_type VARCHAR(100),
    health_score DECIMAL(5, 2),
    suitable_crops TEXT[],
    fertilizer_recommendations JSONB,
    risk_indicators JSONB,
    lab_report_url TEXT,
    notes TEXT,
    tested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_soil_reports_farm ON soil_reports(farm_id);
CREATE INDEX idx_soil_reports_farmer ON soil_reports(farmer_id);
CREATE INDEX idx_soil_reports_tested ON soil_reports(tested_at);

-- ============================================================
-- WEATHER REPORTS TABLE
-- ============================================================
CREATE TABLE weather_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    district_id UUID NOT NULL REFERENCES districts(id),
    temperature_c DECIMAL(5, 2),
    feels_like_c DECIMAL(5, 2),
    humidity_pct DECIMAL(5, 2),
    pressure_hpa DECIMAL(7, 2),
    wind_speed_kmh DECIMAL(6, 2),
    wind_direction VARCHAR(10),
    rainfall_mm DECIMAL(8, 2),
    cloud_cover_pct DECIMAL(5, 2),
    visibility_km DECIMAL(6, 2),
    uv_index DECIMAL(4, 2),
    weather_condition VARCHAR(100),
    weather_condition_bn VARCHAR(100),
    weather_icon VARCHAR(50),
    sunrise TIME,
    sunset TIME,
    forecast_date DATE,
    is_forecast BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_weather_district ON weather_reports(district_id);
CREATE INDEX idx_weather_date ON weather_reports(forecast_date);
CREATE INDEX idx_weather_forecast ON weather_reports(is_forecast);

-- ============================================================
-- MARKET PRICES TABLE
-- ============================================================
CREATE TABLE market_prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    crop_id UUID NOT NULL REFERENCES crops(id),
    district_id UUID REFERENCES districts(id),
    market_name VARCHAR(200),
    price_per_kg DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'BDT',
    price_date DATE NOT NULL,
    price_trend VARCHAR(20) CHECK (price_trend IN ('up', 'down', 'stable')),
    demand_level VARCHAR(20) CHECK (demand_level IN ('low', 'medium', 'high', 'very_high')),
    supply_level VARCHAR(20) CHECK (supply_level IN ('low', 'medium', 'high', 'very_high')),
    source VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_market_crop ON market_prices(crop_id);
CREATE INDEX idx_market_district ON market_prices(district_id);
CREATE INDEX idx_market_date ON market_prices(price_date);
CREATE INDEX idx_market_crop_date ON market_prices(crop_id, price_date DESC);

-- ============================================================
-- PREDICTIONS TABLE
-- ============================================================
CREATE TABLE predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farmer_id UUID REFERENCES farmers(id),
    farm_id UUID REFERENCES farms(id),
    prediction_type VARCHAR(50) NOT NULL CHECK (prediction_type IN (
        'crop_recommendation', 'yield_prediction', 'disease_detection',
        'market_forecast', 'weather_forecast', 'disaster_alert',
        'soil_health', 'profit_estimate'
    )),
    input_data JSONB NOT NULL,
    output_data JSONB NOT NULL,
    confidence_score DECIMAL(5, 4),
    model_version VARCHAR(50),
    model_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_predictions_farmer ON predictions(farmer_id);
CREATE INDEX idx_predictions_farm ON predictions(farm_id);
CREATE INDEX idx_predictions_type ON predictions(prediction_type);
CREATE INDEX idx_predictions_created ON predictions(created_at DESC);

-- ============================================================
-- DISEASE REPORTS TABLE
-- ============================================================
CREATE TABLE disease_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farmer_id UUID NOT NULL REFERENCES farmers(id),
    farm_id UUID REFERENCES farms(id),
    crop_id UUID REFERENCES crops(id),
    image_url TEXT NOT NULL,
    disease_name VARCHAR(200),
    disease_name_bn VARCHAR(200),
    confidence_score DECIMAL(5, 4),
    severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    treatment_recommendations JSONB,
    affected_area_pct DECIMAL(5, 2),
    notes TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'treated', 'resolved')),
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_disease_farmer ON disease_reports(farmer_id);
CREATE INDEX idx_disease_farm ON disease_reports(farm_id);
CREATE INDEX idx_disease_crop ON disease_reports(crop_id);
CREATE INDEX idx_disease_status ON disease_reports(status);

-- ============================================================
-- YIELD REPORTS TABLE
-- ============================================================
CREATE TABLE yield_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farmer_id UUID NOT NULL REFERENCES farmers(id),
    farm_id UUID NOT NULL REFERENCES farms(id),
    crop_id UUID NOT NULL REFERENCES crops(id),
    season VARCHAR(50) NOT NULL,
    year INT NOT NULL,
    area_acres DECIMAL(10, 4) NOT NULL,
    expected_yield DECIMAL(10, 4),
    actual_yield DECIMAL(10, 4),
    yield_per_acre DECIMAL(10, 4),
    total_revenue DECIMAL(12, 2),
    total_cost DECIMAL(12, 2),
    profit DECIMAL(12, 2),
    roi_pct DECIMAL(6, 2),
    irrigation_used BOOLEAN DEFAULT FALSE,
    fertilizer_used TEXT,
    pesticide_used TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_yield_farmer ON yield_reports(farmer_id);
CREATE INDEX idx_yield_farm ON yield_reports(farm_id);
CREATE INDEX idx_yield_crop ON yield_reports(crop_id);
CREATE INDEX idx_yield_season ON yield_reports(season, year);

-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farmer_id UUID NOT NULL REFERENCES farmers(id),
    title VARCHAR(200) NOT NULL,
    title_bn VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    message_bn TEXT NOT NULL,
    notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN (
        'weather_alert', 'flood_alert', 'drought_alert', 'cyclone_alert',
        'disease_outbreak', 'harvest_reminder', 'fertilizer_reminder',
        'market_update', 'government_advisory', 'system'
    )),
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    is_read BOOLEAN DEFAULT FALSE,
    action_url TEXT,
    metadata JSONB,
    sent_via VARCHAR(20)[] DEFAULT ARRAY['push'],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_farmer ON notifications(farmer_id);
CREATE INDEX idx_notifications_type ON notifications(notification_type);
CREATE INDEX idx_notifications_unread ON notifications(farmer_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- ============================================================
-- CHAT HISTORY TABLE
-- ============================================================
CREATE TABLE chat_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farmer_id UUID NOT NULL REFERENCES farmers(id),
    session_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    content_bn TEXT,
    language VARCHAR(10) DEFAULT 'bn',
    intent VARCHAR(100),
    entities JSONB,
    confidence DECIMAL(5, 4),
    tokens_used INT,
    model_used VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chat_farmer ON chat_history(farmer_id);
CREATE INDEX idx_chat_session ON chat_history(session_id);
CREATE INDEX idx_chat_created ON chat_history(created_at DESC);

-- ============================================================
-- VOICE LOGS TABLE
-- ============================================================
CREATE TABLE voice_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farmer_id UUID NOT NULL REFERENCES farmers(id),
    audio_url TEXT NOT NULL,
    transcription TEXT,
    transcription_language VARCHAR(10) DEFAULT 'bn',
    response_text TEXT,
    response_audio_url TEXT,
    intent VARCHAR(100),
    confidence DECIMAL(5, 4),
    duration_seconds DECIMAL(6, 2),
    processing_time_ms INT,
    status VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_voice_farmer ON voice_logs(farmer_id);
CREATE INDEX idx_voice_status ON voice_logs(status);
CREATE INDEX idx_voice_created ON voice_logs(created_at DESC);

-- ============================================================
-- FARM CROP HISTORY TABLE
-- ============================================================
CREATE TABLE farm_crop_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    crop_id UUID NOT NULL REFERENCES crops(id),
    season VARCHAR(50) NOT NULL,
    year INT NOT NULL,
    area_acres DECIMAL(10, 4),
    yield_amount DECIMAL(10, 4),
    revenue DECIMAL(12, 2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_farm_crop_history_farm ON farm_crop_history(farm_id);
CREATE INDEX idx_farm_crop_history_season ON farm_crop_history(season, year);

-- ============================================================
-- GOVERNMENT ADVISORIES TABLE
-- ============================================================
CREATE TABLE government_advisories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(300) NOT NULL,
    title_bn VARCHAR(300) NOT NULL,
    content TEXT NOT NULL,
    content_bn TEXT NOT NULL,
    advisory_type VARCHAR(50) NOT NULL,
    target_districts UUID[],
    target_crops UUID[],
    issued_by VARCHAR(200),
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_advisories_type ON government_advisories(advisory_type);
CREATE INDEX idx_advisories_active ON government_advisories(is_active) WHERE is_active = TRUE;

-- ============================================================
-- SATELLITE DATA TABLE
-- ============================================================
CREATE TABLE satellite_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id UUID REFERENCES farms(id),
    district_id UUID REFERENCES districts(id),
    capture_date DATE NOT NULL,
    ndvi DECIMAL(5, 4),
    ndwi DECIMAL(5, 4),
    evi DECIMAL(5, 4),
    soil_moisture DECIMAL(5, 4),
    land_surface_temp DECIMAL(5, 2),
    vegetation_health VARCHAR(20) CHECK (vegetation_health IN ('excellent', 'good', 'moderate', 'poor', 'critical')),
    stress_level VARCHAR(20),
    image_url TEXT,
    source VARCHAR(50) DEFAULT 'sentinel-2',
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_satellite_farm ON satellite_data(farm_id);
CREATE INDEX idx_satellite_district ON satellite_data(district_id);
CREATE INDEX idx_satellite_date ON satellite_data(capture_date DESC);

-- ============================================================
-- DISASTER ALERTS TABLE
-- ============================================================
CREATE TABLE disaster_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
        'flood', 'drought', 'cyclone', 'storm', 'heatwave', 'cold_wave', 'fog'
    )),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'extreme')),
    title VARCHAR(200) NOT NULL,
    title_bn VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    description_bn TEXT NOT NULL,
    affected_districts UUID[] NOT NULL,
    affected_area GEOMETRY(MULTIPOLYGON, 4326),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    source VARCHAR(200),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_disaster_type ON disaster_alerts(alert_type);
CREATE INDEX idx_disaster_active ON disaster_alerts(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_disaster_time ON disaster_alerts(start_time DESC);

-- ============================================================
-- SEASONAL CALENDAR TABLE
-- ============================================================
CREATE TABLE seasonal_calendar (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    season VARCHAR(50) NOT NULL,
    season_bn VARCHAR(50) NOT NULL,
    start_month INT NOT NULL,
    end_month INT NOT NULL,
    crop_ids UUID[],
    activities JSONB,
    district_id UUID REFERENCES districts(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG TABLE
-- ============================================================
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- ============================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_districts_updated_at BEFORE UPDATE ON districts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_farmers_updated_at BEFORE UPDATE ON farmers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_farms_updated_at BEFORE UPDATE ON farms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_crops_updated_at BEFORE UPDATE ON crops FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Calculate farm area from boundary polygon
CREATE OR REPLACE FUNCTION calculate_farm_area()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.boundary IS NOT NULL THEN
        NEW.area_acres = ST_Area(NEW.boundary::geography) / 4046.86;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_calculate_farm_area BEFORE INSERT OR UPDATE ON farms FOR EACH ROW EXECUTE FUNCTION calculate_farm_area();
