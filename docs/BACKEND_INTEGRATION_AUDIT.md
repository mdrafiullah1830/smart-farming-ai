# Backend Integration Audit

Evidence-based audit of how the five redesigned frontend pages call the Worker API and AI service. Values marked **live** come from real endpoints; **honest offline** means the UI shows em dash / state banners instead of fabricated numbers.

## Frontend → API surface

| Page | Controller | Primary endpoints | Failure handling |
|------|------------|-------------------|------------------|
| Home `index.html` | `scripts/pages/home.js` | `GET /api/v1/weather`, `GET /api/v1/market/prices`, `GET /api/v1/crops/calendar`, `GET /api/v1/disaster/alerts` | `setState` error/empty; hero metrics stay `—` |
| Dashboard `dashboard.html` | `scripts/pages/dashboard.js` | `GET /api/v1/auth/profile` (via shell), `GET /api/v1/devices`, `GET /api/v1/sensors/summary`, `GET /api/v1/market/prices`, weather/forecast | Unauthorized → auth modal; irrigation stays disabled without device |
| Market `market.html` | `scripts/pages/market.js` | `GET /api/v1/market/prices`, `GET /api/v1/market/history/:crop`, `GET /api/v1/market/districts`, `GET /api/v1/market/prices/live` | Alerts/watchlist gated by `requireAuth`; chart range tabs local |
| Soil `soil.html` | `scripts/pages/soil.js` | `GET /api/v1/locations/divisions|zillas|unions`, `GET /api/v1/soil/features/:district/:upazila`, `GET /api/v1/soil/summary`, fertilizer/crop rec | `#comparePanel` hidden until user opens; report loading/error banners |
| AI `ai-search.html` | `scripts/pages/ai.js` | `GET /api/v1/ai-search?q=`, `POST /api/v1/chat`, upload/disease if authorized | Model unavailable → honest `modelUnavailable` banner; save/photo require auth |

## Shared client (`scripts/api.js`)

- Timeout default **12s** per request (`timeoutMs` overridable).
- Every request sends `X-Request-Id` (UUID); response `X-Request-Id` preferred when present.
- Errors map: 401 unauthorized, 403 forbidden, 404 not_found, 429 rate_limited, 5xx server_error, abort → `timeout`, fetch throw → `network`.
- Bearer token from `window.localStorage.sfAccessToken` / credentials helpers when present.

## Worker observability (`apps/worker-api`)

- `createRequestId` reuses inbound `X-Request-Id` (≤128 chars) or mints UUID.
- Every response echoes `X-Request-Id`.
- Structured JSON logs: `{ ts, level, msg, requestId, method, path, status, durationMs }`.
- Rate limit 429 also logs and includes `requestId` in body.
- Security headers + rate-limit headers unchanged from baseline.

## AI service (`apps/ai-service`)

- Health: `{ status, service, models: { disease, crop, yield, market, advisory, travel } }`.
- Tests force `SERVICE_TOKEN=test-token`; travel model status may be `ok` or `unavailable` depending on RAG index readiness.

## Honest UI contracts (DoD)

| Concern | Implementation |
|---------|----------------|
| No fabricated live values | Placeholders `—`; API success replaces them |
| No dead `href="#"` | HTML avoids bare `#`; controllers rewrite leftovers |
| bn/en toggle | `[data-lang]` buttons on all pages; `bindLangToggle` + `applyI18n` |
| Irrigation honesty | Switch `disabled` + `aria-checked=false` without linked device |
| Model unavailable | AI answer card state banner, not fake answers |
| Request IDs | Client + worker share `X-Request-Id` |

## Validation commands

```bash
npm run lint:frontend     # eslint
npm run build:frontend    # vite build (5 pages)
npm run typecheck:worker  # tsc --noEmit
npm run test:worker       # node:test worker unit
npm run test:frontend     # node --test unit
npx playwright test --project=chromium --project="Mobile Chrome"
npm run test:ai           # pytest in apps/ai-service
```

## Traceability (spec → artifact)

| Spec item | Artifact |
|-----------|----------|
| Five-page redesign usable | `frontend/web/*.html` + `scripts/pages/*.js` |
| bn/en everywhere | `i18n.js`, `shell.js`, lang toggles in each page |
| Honest states | `states.js`, irrigation/AI/soil/marketing controllers |
| E2E desktop+mobile | `tests/e2e.spec.ts` flows 1–10 + `playwright.config.ts` projects |
| Unit tests | `frontend/tests/unit/*.test.js` |
| Worker tests | `apps/worker-api/tests/*.mjs` |
| Request ID / logs / latency | `apps/worker-api/src/index.ts`, `src/http.ts` |
| API docs | `docs/API_DOCUMENTATION.md`, this file |
