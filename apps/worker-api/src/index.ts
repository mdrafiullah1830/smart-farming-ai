import { corsHeaders, json, error, checkRateLimit, addRateLimitHeaders, addSecurityHeaders } from './http.ts';
import { authenticateDevice } from './sensors.ts';
import type { Env } from './types.ts';
import { currentUser } from './auth.ts';

// Import all route modules
import { registerRoute, loginRoute, refreshRoute, logoutRoute, googleLoginRoute, profileRoute } from './routes/auth.ts';
import { devicesRoute, deviceRotateKeyRoute, deviceThresholdsRoute } from './routes/devices.ts';
import { sensorsReadingsRoute, sensorsAlertsRoute, sensorsSummaryRoute } from './routes/sensors.ts';
import { weatherRoute, weatherLocationRoute } from './routes/weather.ts';
import { uploadsRoute, diseaseAnalyzeRoute } from './routes/uploads.ts';
import { farmsRoute, deleteFarmRoute } from './routes/farms.ts';
import { 
  chatRoute, cropRecommendationRoute, aiSearchRoute, 
  soilSummaryRoute, soilDistrictsRoute, soilUpazilasRoute, 
  soilFeaturesRoute, soilNearestRoute, soilCropRecommendationRoute 
} from './routes/advisory.ts';
import { 
  marketRoute, marketDailyRoute, marketDistrictsRoute, marketHistoryRoute,
  marketLiveRoute, marketUpazilaRoute, cropCalendarRoute, fertilizerRoute,
  groundwaterRoute, disasterAlertsRoute
} from './routes/market.ts';
import { 
  districtsRoute, districtDetailRoute, divisionsRoute, zillasRoute, unionsRoute 
} from './routes/locations.ts';
import { aiHealthRoute, notificationsRoute } from './routes/integrations.ts';

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (path === '/health') return json(request, env, { status: 'ok', service: 'worker-api' });

  // Auth routes
  if (path === '/api/v1/auth/register' && method === 'POST') return registerRoute(request, env);
  if (path === '/api/v1/auth/login' && method === 'POST') return loginRoute(request, env);
  if (path === '/api/v1/auth/refresh' && method === 'POST') return refreshRoute(request, env);
  if (path === '/api/v1/auth/logout' && method === 'POST') return logoutRoute(request, env);
  if (path === '/api/v1/auth/google' && method === 'POST') return googleLoginRoute(request, env);
  if (path === '/api/v1/auth/profile' && method === 'GET') return profileRoute(request, env);

  // Device routes
  if (path === '/api/v1/devices' && method === 'GET') return devicesRoute(request, env);
  if (path === '/api/v1/devices' && method === 'POST') return devicesRoute(request, env);
  if (path === '/api/v1/devices/rotate-key' && method === 'POST') return deviceRotateKeyRoute(request, env);
  if (path === '/api/v1/devices/thresholds' && method === 'GET') return deviceThresholdsRoute(request, env);
  if (path === '/api/v1/devices/thresholds' && method === 'PUT') return deviceThresholdsRoute(request, env);

  // Sensor routes
  if (path === '/api/v1/sensors/readings' && method === 'POST') return sensorsReadingsRoute(request, env);
  if (path === '/api/v1/sensors/readings' && method === 'GET') return sensorsReadingsRoute(request, env);
  if (path === '/api/v1/sensors/alerts' && method === 'GET') return sensorsAlertsRoute(request, env);
  if (path === '/api/v1/sensors/summary' && method === 'GET') return sensorsSummaryRoute(request, env);

  // Weather routes
  if ((path === '/api/v1/weather' || path === '/api/v1/weather/location') && method === 'GET') {
    return weatherRoute(request, env);
  }

  // Upload routes
  if (path === '/api/v1/uploads/disease' && method === 'POST') return uploadsRoute(request, env);
  if (path === '/api/v1/disease/analyze' && method === 'POST') return diseaseAnalyzeRoute(request, env);

  // Farm routes
  if (path === '/api/v1/farms' && method === 'GET') return farmsRoute(request, env);
  if (path === '/api/v1/farms' && method === 'POST') return farmsRoute(request, env);
  if (path.startsWith('/api/v1/farms/') && method === 'DELETE') {
    return deleteFarmRoute(request, env, decodeURIComponent(path.slice('/api/v1/farms/'.length)));
  }

  // Advisory/Chat routes
  if (path === '/api/v1/chat' && method === 'POST') return chatRoute(request, env);
  if (path === '/api/v1/crop/recommend-dynamic' && method === 'POST') return cropRecommendationRoute(request, env);
  if (path === '/api/v1/ai-search' && method === 'GET') return aiSearchRoute(request, env);
  if (path === '/api/v1/soil/summary' && method === 'GET') return soilSummaryRoute(request, env);
  if (path === '/api/v1/soil/districts' && method === 'GET') return soilDistrictsRoute(request, env);
  if (path.startsWith('/api/v1/soil/upazilas/') && method === 'GET') {
    return soilUpazilasRoute(request, env, decodeURIComponent(path.slice('/api/v1/soil/upazilas/'.length)));
  }
  if (path.startsWith('/api/v1/soil/features/') && method === 'GET') {
    const parts = path.slice('/api/v1/soil/features/'.length).split('/').map(decodeURIComponent);
    if (parts.length < 2) return error(request, env, 400, 'district and upazila are required');
    return soilFeaturesRoute(request, env, parts[0], parts[1]);
  }
  if (path === '/api/v1/soil/nearest' && method === 'GET') return soilNearestRoute(request, env);
  if (path.startsWith('/api/v1/soil/crop-recommendation/') && method === 'GET') {
    const parts = path.slice('/api/v1/soil/crop-recommendation/'.length).split('/').map(decodeURIComponent);
    return soilCropRecommendationRoute(request, env, parts[0], parts[1]);
  }

  // Market routes
  if (path === '/api/v1/market/prices' && method === 'GET') return marketRoute(request, env);
  if (path === '/api/v1/market/prices/daily' && method === 'GET') return marketDailyRoute(request, env);
  if (path === '/api/v1/market/districts' && method === 'GET') return marketDistrictsRoute(request, env);
  if (path.startsWith('/api/v1/market/history/') && method === 'GET') {
    return marketHistoryRoute(request, env, decodeURIComponent(path.slice('/api/v1/market/history/'.length)));
  }
  if (path === '/api/v1/market/prices/live' && method === 'GET') return marketLiveRoute(request, env);
  if (path === '/api/v1/market/prices/upazila' && method === 'GET') return marketUpazilaRoute(request, env);

  // Crop calendar & fertilizer
  if (path === '/api/v1/crops/calendar' && method === 'GET') return cropCalendarRoute(request, env);
  if (path === '/api/v1/crops/fertilizer' && method === 'GET') return fertilizerRoute(request, env);

  // Groundwater
  if (path === '/api/v1/irrigation/groundwater' && method === 'GET') return groundwaterRoute(request, env);

  // Disaster alerts
  if (path === '/api/v1/disaster/alerts' && method === 'GET') return disasterAlertsRoute(request, env);

  // Location routes
  if (path === '/api/v1/districts' && method === 'GET') return districtsRoute(request, env);
  if (path.startsWith('/api/v1/district/') && method === 'GET') {
    return districtDetailRoute(request, env, decodeURIComponent(path.slice('/api/v1/district/'.length)));
  }
  if (path === '/api/v1/locations/divisions' && method === 'GET') return divisionsRoute(request, env);
  if (path === '/api/v1/locations/zillas' && method === 'GET') return zillasRoute(request, env);
  if (path === '/api/v1/locations/unions' && method === 'GET') return unionsRoute(request, env);

  // Integration routes
  if (path === '/api/v1/integrations/ai/health' && method === 'GET') return aiHealthRoute(request, env);
  if ((path === '/api/v1/db/notifications' || path === '/api/v1/notifications') && method === 'GET') return notificationsRoute(request, env);

  return error(request, env, 404, 'Route not found');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let rateLimitInfo: { allowed: boolean; remaining: number; resetTime: number } | null = null;

    // Apply rate limiting to all API endpoints except health
    const url = new URL(request.url);
    if (url.pathname !== '/health' && url.pathname.startsWith('/api/')) {
      rateLimitInfo = await checkRateLimit(request, env);
      if (rateLimitInfo && !rateLimitInfo.allowed) {
        return addSecurityHeaders(addRateLimitHeaders(
          new Response(JSON.stringify({ error: 'Too Many Requests' }), {
            status: 429,
            headers: corsHeaders(request, env)
          }),
          rateLimitInfo
        ));
      }
    }

    try {
      const response = await route(request, env);
      return addSecurityHeaders(addRateLimitHeaders(response, rateLimitInfo));
    } catch (cause) {
      console.error('request_failed', cause);
      return addSecurityHeaders(addRateLimitHeaders(error(request, env, 500, 'Internal server error'), rateLimitInfo));
    }
  },
};