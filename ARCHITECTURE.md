# Smart Farming AI — Architecture (Single Source of Truth)

> If you find conflicting information between this file, `README.md`,
> `docs/ARCHITECTURE.md` or `docs/CLOUD_ARCHITECTURE.md`, **this file wins**.

## TL;DR

| Layer | Path | Status | Why |
|---|---|---|---|
| Edge API | `apps/worker-api/` | **Production** | Actually deployed on Cloudflare Workers; auth, weather, market, files |
| AI service | `apps/ai-service/` | **Production (stub)** | Deployed on Render; honest `model_unavailable` until a real ONNX model is loaded |
| Frontend SPA | `frontend/web/` | **Production** | Deployed on Vercel; 5 HTML pages, vanilla JS |
| Mobile | `frontend/ios/` + `frontend/lib/` | In progress | Flutter shell, not shipped |
| Legacy monolith | `frontend/server.js` | **Dev only** | SQLite-backed feature playground; not the production backend |
| Modular FastAPI | `backend/app/` | **DEPRECATED** | Not wired to the deployed Worker; not the source of truth for any schema |
| Local FastAPI | `backend/main.py` | **Dev only** | Simple FastAPI over SQLite, parallel to `frontend/server.js` |

## Runtime topology

```
Browser (Vercel)
   │
   ▼
Cloudflare Worker (apps/worker-api) ──► Cloudflare D1 (users, market)
   │                                       Cloudflare R2 (uploads)
   │
   ├──► Open-Meteo (free weather)
   ├──► Hugging Face (free disease inference — future)
   │
   └──► AI service (apps/ai-service on Render) — bearer-token protected
              │
              └──► loads ONNX model in lifespan() when one is provided
```

## Data ownership

- **Cloudflare D1** (`apps/worker-api/migrations/`) — users, uploaded_files, market
  prices, district metadata. The Worker is the only writer.
- **SQLite** (`database/smart_farming.db`) — bundled soil & market demo data
  used by the **legacy** `frontend/server.js` for the dev-only `/api/soil/*`
  and `/api/market/*` routes. Read-only at runtime in the Worker topology.
- **PostgreSQL** (`database/schema.sql`) — the schema FastAPI was meant to
  own. Unused while `backend/app/` is deprecated. Keep the file as design
  reference; do not run it as a service.

## Where features live

| Feature | Implementation |
|---|---|
| Auth (register/login/profile) | `apps/worker-api/src/index.ts` |
| Weather (forecast + WMO→Bangla) | `apps/worker-api/src/index.ts` (Open-Meteo) |
| Market prices (current + history) | `apps/worker-api/src/index.ts` + D1 |
| Disease detection (image upload) | Browser → R2 → `apps/ai-service` |
| Crop / yield / market forecast ML | **Not deployed.** Code in `ai_models/`; service stub returns `model_unavailable` |
| Soil lookup, 86K BARC records | `frontend/server.js` reads `database/smart_farming.db` (dev) |
| Interactive map, dashboard SPA | `frontend/web/*.html` + `bd_districts.js` |

## Deprecation of `backend/app/`

The modular FastAPI app under `backend/app/` is **not** the production
backend and is not on the request path of any deployed surface. It exists
for reference. Before any work resumes there, it must be reconciled with
the D1 schema in `apps/worker-api/migrations/`.

Do not deploy `backend/app/`. Do not point the Worker at it. Do not add
new routes there.

## Adding a new feature

1. If it touches user data, write through the Worker to D1.
2. If it touches ML, add an endpoint to `apps/ai-service` and ship a real
   ONNX artifact. Never return a fabricated prediction.
3. If it touches the UI, edit `frontend/web/<page>.html` and bump the
   Vercel deployment.
4. If it touches a model training script, edit under `ai_models/`. Do
   not commit the resulting artifact.
