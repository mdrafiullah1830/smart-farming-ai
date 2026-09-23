# Requirement Traceability Matrix

Maps end-prompt / DoD items to code and proof.

| # | Requirement | Where implemented | How verified |
|---|-------------|-------------------|--------------|
| 1 | Five pages load and are interactive | `frontend/web/{index,dashboard,market,soil,ai-search}.html` + controllers | Playwright flows 1–6 |
| 2 | Bangla/English toggle on all pages | `i18n.js` `bindLangToggle`, `[data-lang]` controls | Playwright flow 2 (all 5 pages) |
| 3 | No dead `href="#"` | Markup + `fixDeadLinks` in controllers | Playwright flow 7 count=0 |
| 4 | No fabricated “live” metrics | Em dash placeholders; API only path to numbers | Flow 1/4/5 honest-value helpers |
| 5 | Honest irrigation state | `dashboard.js` `loadIrrigation` disables switch without device | Flow 9 |
| 6 | Model unavailable handled | `ai.js` + `modelUnavailable` i18n + state banners | Flow 6 submit path |
| 7 | Request IDs client→API | `api.js` `X-Request-Id`; worker `createRequestId` echo | Unit `api.test.js`; worker tests |
| 8 | Structured logs + latency | Worker `fetch` JSON log with `durationMs` | `src/index.ts` |
| 9 | Timeouts on external calls | `apiFetch` default 12s abort | Unit timeout test |
| 10 | Frontend unit tests | `frontend/tests/unit/{api,format,i18n,dom,storage,states,optimistic}.test.js` | `npm run test:frontend` (45 pass) |
| 11 | E2E all pages desktop+mobile | `tests/e2e.spec.ts`; projects chromium/firefox/webkit/Mobile Chrome/Mobile Safari | `npx playwright test` |
| 12 | Worker unit tests | `apps/worker-api/tests` | `npm run test:worker` (33 pass) |
| 13 | Worker typecheck | `npm run typecheck` → `tsc --noEmit` | clean |
| 14 | AI service tests | `apps/ai-service/tests` | `npm run test:ai` (99 pass) |
| 15 | Frontend lint/build | `frontend` eslint + vite | clean lint; 5-page dist |
| 16 | Integration audit | `docs/BACKEND_INTEGRATION_AUDIT.md` | review |
| 17 | API documentation | `docs/API_DOCUMENTATION.md` | review |
| 18 | Observability in API docs | Worker request-id/log section in audit + API doc note | review |
| 19 | Render deploy / log reliability | `render.yaml`, `backend/Dockerfile`, `apps/ai-service/Dockerfile`, committed RAG index | CI docker builds; health paths `/health`, `/api/v1/health` |
| 20 | Changes committed and pushed | `origin/main` after validation | git push |

## Validation command block

```bash
npm install
npm run validate
npx playwright test --project=chromium --project="Mobile Chrome"
npm run test:ai
```

## Latest evidence (this session)

| Command | Result |
|---------|--------|
| `frontend` eslint | 0 errors |
| `frontend` vite build | success (5 pages) |
| `npm run test:frontend` | 45 pass / 0 fail |
| `apps/worker-api` `npm test` | 33 pass / 0 fail |
| `apps/worker-api` typecheck | clean |
| `apps/ai-service` pytest | 99 pass / 0 fail |
| Playwright chromium + Mobile Chrome | **40 pass / 2 skipped** (Flow 10 mobile-only on desktop project) |
| Full narrative | `docs/FINAL_REPORT.md` |

## Render deploy note

Root `render.yaml` deploys two Docker web services with strict health checks.
Both images set `PYTHONUNBUFFERED=1` and bind `0.0.0.0:$PORT` (default 10000).
The AI image ships the prebuilt travel RAG index so Render free-tier builds do
not re-download a HuggingFace model.

## Push evidence

After validation, all changes were committed and pushed to `origin/main`
(`main` tracks `https://github.com/mdrafiullah1830/smart-farming-ai.git`).
