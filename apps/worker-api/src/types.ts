export interface Env {
  DB: D1Database;
  UPLOADS: R2Bucket;
  RATE_LIMIT_KV: KVNamespace;
  APP_ENV: string;
  ALLOWED_ORIGINS: string;
  AI_SERVICE_URL: string;
  AI_SERVICE_TOKEN: string;
  JWT_SECRET: string;
  /** Google OAuth web client ID. When unset, /api/v1/auth/google returns 503. */
  GOOGLE_CLIENT_ID?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  exp: number;
}
