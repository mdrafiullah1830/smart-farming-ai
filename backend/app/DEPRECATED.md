# `backend/app/` — DEPRECATED

This modular FastAPI app is **not** wired to the deployed production
surface (Cloudflare Worker + Render AI service). It is kept for reference
only.

The source of truth for the production schema lives in
[`apps/worker-api/migrations/`](../../apps/worker-api/migrations/).

If you need to revive this stack, first reconcile the SQLAlchemy models
under `app/models/` with the D1 migrations, and remove the legacy
`mongodb` / `redis` references that are no longer reachable from the
deployed Worker.
