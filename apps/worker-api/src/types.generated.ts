// Generated from Python Pydantic models
// DO NOT EDIT MANUALLY - run scripts/generate_ts_types.py to regenerate

export interface CropCandidate {
  crop: string;
  confidence: number;
}

export interface CropRecommendRequest {
  temperature: number;
  humidity: number;
  rainfall: number;
  ph: number;
  nitrogen: number;
  phosphorus: number;
  potassium: number;
  top_k?: number;
}

export interface CropRecommendResponse {
  status: string;
  message: string;
  model?: string;
  recommendations?: CropCandidate[];
}

export interface DiseaseRequest {
  job_id: string;
  image_url?: string;
  image_base64?: string;
}

export interface DiseaseResponse {
  job_id: string;
  status: string;
  message: string;
  predictions?: unknown[];
}

export interface MarketForecastRequest {
  crop: string;
  history: number[];
  days?: number;
}

export interface MarketForecastResponse {
  status: string;
  message: string;
  model?: string;
  forecast?: number[];
  trend?: string;
}

export interface SensorAdvisoryRequest {
  moisture_percent?: number;
  soil_temperature_c?: number;
  air_temperature_c?: number;
  rainfall_next_24h_mm?: number;
  crop?: string;
  moisture_min_percent?: number;
  moisture_max_percent?: number;
}

export interface SensorAdvisoryResponse {
  status: string;
  irrigation_action: string;
  message_en: string;
  message_bn: string;
  reasons: string[];
}

export interface YieldPredictRequest {
  crop: string;
  temperature: number;
  humidity: number;
  rainfall: number;
  ph: number;
  nitrogen: number;
  area_acres: number;
  irrigation_used?: boolean;
  season?: string;
}

export interface YieldPredictResponse {
  status: string;
  message: string;
  model?: string;
  yield_per_acre?: number;
  total_yield?: number;
}

// Common API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  page_size: number;
}
