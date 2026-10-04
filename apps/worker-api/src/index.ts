import { corsHeaders, json, error, checkRateLimit, addRateLimitHeaders, addSecurityHeaders, createRequestId } from './http.ts';
import { authenticateDevice } from './sensors.ts';
import type { Env } from './types.ts';
import { currentUser } from './auth.ts';

// Import all route modules
import { registerRoute, loginRoute, refreshRoute, logoutRoute, googleLoginRoute, profileRoute } from './routes/auth.ts';
import { devicesRoute, deviceRotateKeyRoute, deviceThresholdsRoute, deviceCommandRoute } from './routes/devices.ts';
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
import { clientErrorsRoute } from './routes/telemetry.ts';
import { tasksRoute } from './routes/tasks.ts';
import {
  createListingRoute, listListingsRoute, getListingRoute,
  updateListingRoute, deleteListingRoute,
  createOrderRoute, listOrdersRoute, updateOrderRoute,
  createOrderMessageRoute, listOrderMessagesRoute
} from './routes/marketplace.ts';
import {
  floodAssessmentRoute, floodExposureRoute, floodActionRoute,
  floodZonesRoute, floodDistrictRoute
} from './routes/flood.ts';
import { voiceAskRoute, voiceCapabilitiesRoute } from './routes/voice.ts';

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
  if (path.startsWith('/api/v1/devices/') && path.endsWith('/command') && method === 'POST') {
    return deviceCommandRoute(request, env, decodeURIComponent(path.slice('/api/v1/devices/'.length, -'/command'.length)));
  }

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

  // Direct farmer-to-buyer marketplace
  if (path === '/api/v1/marketplace/listings' && method === 'GET') return listListingsRoute(request, env);
  if (path === '/api/v1/marketplace/listings' && method === 'POST') return createListingRoute(request, env);
  if (path.startsWith('/api/v1/marketplace/listings/') && method === 'GET') {
    return getListingRoute(request, env, decodeURIComponent(path.slice('/api/v1/marketplace/listings/'.length)));
  }
  if (path.startsWith('/api/v1/marketplace/listings/') && method === 'PATCH') {
    return updateListingRoute(request, env, decodeURIComponent(path.slice('/api/v1/marketplace/listings/'.length)));
  }
  if (path.startsWith('/api/v1/marketplace/listings/') && method === 'DELETE') {
    return deleteListingRoute(request, env, decodeURIComponent(path.slice('/api/v1/marketplace/listings/'.length)));
  }
  if (path === '/api/v1/marketplace/orders' && method === 'GET') return listOrdersRoute(request, env);
  if (path === '/api/v1/marketplace/orders' && method === 'POST') return createOrderRoute(request, env);
  if (path.startsWith('/api/v1/marketplace/orders/') && path.endsWith('/messages') && method === 'POST') {
    const orderId = decodeURIComponent(path.slice('/api/v1/marketplace/orders/'.length, -'/messages'.length));
    return createOrderMessageRoute(request, env, orderId);
  }
  if (path.startsWith('/api/v1/marketplace/orders/') && path.endsWith('/messages') && method === 'GET') {
    const orderId = decodeURIComponent(path.slice('/api/v1/marketplace/orders/'.length, -'/messages'.length));
    return listOrderMessagesRoute(request, env, orderId);
  }
  if (path.startsWith('/api/v1/marketplace/orders/') && method === 'PATCH') {
    return updateOrderRoute(request, env, decodeURIComponent(path.slice('/api/v1/marketplace/orders/'.length)));
  }

  // Flood & Climate Resilience
  // `/flood/districts/:id` is checked before `/flood/exposures/:id` style
  // patterns would be, because the two prefixes cannot collide.
  if (path === '/api/v1/flood/assessment' && method === 'GET') return floodAssessmentRoute(request, env);
  if (path === '/api/v1/flood/zones' && method === 'GET') return floodZonesRoute(request, env);
  if (path === '/api/v1/flood/exposures' && method === 'GET') return floodExposureRoute(request, env);
  if (path === '/api/v1/flood/exposures' && method === 'POST') return floodExposureRoute(request, env);
  if (path.startsWith('/api/v1/flood/exposures/') && method === 'DELETE') {
    return floodExposureRoute(request, env, decodeURIComponent(path.slice('/api/v1/flood/exposures/'.length)));
  }
  if (path === '/api/v1/flood/actions' && method === 'GET') return floodActionRoute(request, env);
  if (path === '/api/v1/flood/actions' && method === 'POST') return floodActionRoute(request, env);
  if (path.startsWith('/api/v1/flood/districts/') && method === 'GET') {
    return floodDistrictRoute(request, env, decodeURIComponent(path.slice('/api/v1/flood/districts/'.length)));
  }

  // Voice-first assistant. `voice/ask` is public because the curated guidance
  // needs no account; the client holds the conversation context.
  if (path === '/api/v1/voice/ask' && method === 'POST') return voiceAskRoute(request, env);
  if (path === '/api/v1/voice/capabilities' && method === 'GET') return voiceCapabilitiesRoute(request, env);

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

  // Client telemetry + dashboard task sync
  if (path === '/api/v1/client-errors' && method === 'POST') return clientErrorsRoute(request, env);
  if (path === '/api/v1/tasks' && (method === 'GET' || method === 'POST')) return tasksRoute(request, env);

  return error(request, env, 404, 'Route not found');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const started = Date.now();
    const requestId = createRequestId(request);
    const url = new URL(request.url);
    let rateLimitInfo: { allowed: boolean; remaining: number; resetTime: number } | null = null;

    // Apply rate limiting to all API endpoints except health
    if (url.pathname !== '/health' && url.pathname.startsWith('/api/')) {
      rateLimitInfo = await checkRateLimit(request, env);
      if (rateLimitInfo && !rateLimitInfo.allowed) {
        console.log(JSON.stringify({
          ts: new Date().toISOString(),
          level: 'warn',
          msg: 'rate_limited',
          requestId,
          method: request.method,
          path: url.pathname,
          status: 429,
          durationMs: Date.now() - started,
        }));
        return addSecurityHeaders(addRateLimitHeaders(
          new Response(JSON.stringify({ error: 'Too Many Requests', requestId }), {
            status: 429,
            headers: corsHeaders(request, env, requestId)
          }),
          rateLimitInfo
        ));
      }
    }

    try {
      const response = await route(request, env);
      const withId = new Headers(response.headers);
      withId.set('X-Request-Id', requestId);
      const out = addSecurityHeaders(addRateLimitHeaders(
        new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: withId,
        }),
        rateLimitInfo
      ));
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info',
        msg: 'request',
        requestId,
        method: request.method,
        path: url.pathname,
        status: response.status,
        durationMs: Date.now() - started,
      }));
      return out;
    } catch (cause) {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        msg: 'request_failed',
        requestId,
        method: request.method,
        path: url.pathname,
        status: 500,
        durationMs: Date.now() - started,
        error: cause instanceof Error ? cause.message : String(cause),
      }));
      console.error('request_failed', cause);
      return addSecurityHeaders(addRateLimitHeaders(error(request, env, 500, 'Internal server error', requestId), rateLimitInfo));
    }
  },
};