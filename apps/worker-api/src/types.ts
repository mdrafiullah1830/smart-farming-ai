export interface Env {
  DB: D1Database;
  UPLOADS: R2Bucket;
  APP_ENV: string;
  ALLOWED_ORIGINS: string;
  AI_SERVICE_URL: string;
  JWT_SECRET: string;
}

export interface AuthUser {
  id: string;
  email: string;
  exp: number;
}
