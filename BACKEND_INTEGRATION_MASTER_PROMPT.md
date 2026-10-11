# Smart Farming AI — Complete Backend Integration Master Prompt

Copy everything from **BEGIN PROMPT** through **END PROMPT** into Codex, OpenAI Code, Claude Code, Gemini CLI, or another capable coding agent while that agent is opened at the root of this repository.

---

## BEGIN PROMPT

You are the senior full-stack engineer responsible for completing the production backend integration of the existing **Smart Farming AI — Bangladesh** repository.

Your job is not to create a prototype, write a plan only, or replace the existing product with a new design. Your job is to inspect the repository, finish the production architecture, connect every visible frontend feature to real application logic, and verify the complete system end to end.

Work autonomously and carefully until the acceptance criteria in this prompt are satisfied. Do not claim completion when a button is still decorative, an API returns fabricated data, a page depends on hard-coded demo values, or a test was not actually run.

### 1. Primary outcome

Deliver a complete, working integration for these five existing pages:

1. `frontend/web/index.html`
2. `frontend/web/dashboard.html`
3. `frontend/web/market.html`
4. `frontend/web/soil.html`
5. `frontend/web/ai-search.html`

The current visual design must remain recognizably the same. Preserve the layout, backgrounds, typography, spacing system, glass/panel styling, colors, responsive behavior, and existing assets. Add only the minimum UI needed for real behavior, such as dialogs, drawers, toasts, loading skeletons, empty states, error states, forms, confirmation prompts, accessible labels, and data hooks.

Every visible control must work. Every displayed live value must come from a real API, a persisted user record, a documented deterministic calculation, or an explicitly labelled unavailable/demo state. Never present invented live data as real data.

### 2. Repository facts and architectural authority

Before changing code, read completely:

- `AGENTS.md` and any nested `AGENTS.md`, if present
- `ARCHITECTURE.md`
- `README.md`
- `.env.example`
- `frontend/.env.example`
- `frontend/web/vercel.json`
- all five HTML files listed above
- `frontend/web/design-system.css`
- all Worker source, migrations, tests, and configuration under `apps/worker-api/`
- all AI service source, tests, model metadata, and configuration under `apps/ai-service/`
- relevant schemas and data import utilities under `database/`, `datasets/`, `scripts/`, and `ai_models/`

Treat `ARCHITECTURE.md` as the source of truth when documentation conflicts.

The intended production topology is:

```text
Static frontend on Vercel
        |
        | same-origin /api/* requests
        v
Cloudflare Worker under apps/worker-api
        |-- Cloudflare D1 for relational application data
        |-- Cloudflare KV/cache where already configured
        |-- Cloudflare R2 for user uploads where already configured
        |-- Open-Meteo and approved public data sources
        v
FastAPI AI service under apps/ai-service for model inference only
```

Important constraints:

- `backend/app/` is deprecated. Do not revive it, deploy it, or make the frontend depend on it.
- `backend/main.py` and `frontend/server.js`/`frontend/server.cjs` are development or legacy implementations. They may be used as reference or as a data migration source, but they must not become the production source of truth.
- The Cloudflare Worker is the public production API gateway and the only normal writer to D1/R2.
- The AI service is private behind the Worker. Browser code must never call the private AI service directly.
- Preserve backward compatibility for working Worker endpoints unless there is a documented security reason not to.
- `frontend/web/vercel.json` already rewrites browser `/api/:path*` to the deployed Worker `/api/v1/:path*`. Browser modules should therefore use relative URLs such as `/api/weather`, not a hard-coded production hostname.
- Do not commit secrets, generated model artifacts, local databases, uploads, `.dev.vars`, or `.env` files.

### 3. Free-only implementation policy

The product must run without a required paid API or paid AI subscription.

Allowed defaults include:

- Open-Meteo for weather, with caching and timeout handling
- Existing D1, KV, and R2 bindings and their available free quotas
- Existing checked-in/open-source ONNX models after validating them
- Deterministic rules based on trusted agricultural data
- Curated local knowledge, retrieval, BM25/TF-IDF, or other open-source inference
- Browser Web Speech, Speech Synthesis, Web Share, Geolocation, Notifications, and Print APIs with fallbacks
- OpenStreetMap links or other no-key map links for directions
- Existing open-source packages already suitable for the repository

Forbidden as a required dependency:

- OpenAI API keys
- Anthropic API keys
- Gemini paid API keys
- Perplexity paid API keys
- a paid map API
- a paid weather API
- any service that silently starts billing
- scraping protected pages in violation of their terms
- presenting an optional provider as if it were guaranteed free forever

If an optional external provider is supported, put it behind a provider interface, keep the free deterministic path as the default, document the optional environment variables, and make the app degrade honestly when the provider is absent.

“Completely free” does not mean pretending free tiers have unlimited capacity. Handle quota exhaustion and service unavailability explicitly and document operational limits.

### 4. Non-negotiable engineering rules

1. Inspect existing code before deciding what is missing.
2. Reuse and repair correct existing endpoints instead of duplicating them.
3. Do not trust README endpoint tables without checking actual source and tests.
4. Do not redesign the five pages.
5. Do not delete the supplied background/source images.
6. Do not remove working features merely to simplify implementation.
7. Do not hard-code a fake current date, weather value, price, sensor count, health score, confidence score, user identity, or location.
8. Do not invent AI predictions when a model is unavailable.
9. Do not silently switch real device controls into simulated controls.
10. Guest/demo seed data must be visibly identified as demo data.
11. Actual IoT actuation must require a registered device, authorization, a confirmation step, an idempotency key, and an audit entry.
12. Validate all input at the API boundary.
13. Use parameterized D1 statements only.
14. Add rate limits to auth, AI, uploads, search, and write endpoints.
15. Never put a service token or private secret in frontend JavaScript.
16. Preserve responsive behavior at 360, 768, 1024, and 1440 pixel widths.
17. Preserve keyboard access and visible focus states.
18. No interactive element may retain `href="#"` without a real handler and meaningful behavior.
19. No button may exist without a real handler or a clearly disabled state explaining why it is unavailable.
20. Do not push, deploy, create cloud resources, rotate secrets, or destroy data without explicit user permission. Local implementation, migrations, tests, and documentation are authorized.

### 5. Required working method

Proceed in phases. Do not stop after producing an audit or plan.

#### Phase 0 — Establish the baseline

1. Run `git status --short` and preserve unrelated user changes.
2. Identify the repository root and active branch.
3. Inspect the five pages and enumerate every link, button, input, select, checkbox, tab, card action, keyboard shortcut, and data display.
4. Inspect actual Worker routes, bindings, migrations, tests, and AI endpoints.
5. Run the existing frontend, Worker, and AI-service tests that can run locally.
6. Start the existing frontend and capture the baseline appearance of all five pages at desktop and mobile widths.
7. Create `docs/BACKEND_INTEGRATION_AUDIT.md` containing:
   - frontend control inventory;
   - existing endpoint inventory;
   - missing endpoint inventory;
   - schema/binding inventory;
   - hard-coded/live-data inventory;
   - risks and repository contradictions;
   - a traceability matrix linking every UI feature to an endpoint, data source, test, and final status.
8. Continue directly into implementation after writing the audit.

#### Phase 1 — Frontend integration foundation

Create small ES modules rather than adding another large inline script. Suggested structure:

```text
frontend/web/assets/js/
  api-client.js
  auth.js
  config.js
  dom.js
  format.js
  i18n.js
  notifications.js
  state.js
  ui-feedback.js
  pages/
    home.js
    dashboard.js
    market.js
    soil.js
    ai-search.js
```

The exact file names may change if the repository already has an equivalent structure. Do not create duplicate frameworks.

The shared API client must provide:

- relative `/api` base URL by default;
- configurable local development base URL without embedding secrets;
- `GET`, `POST`, `PUT`/`PATCH`, and `DELETE` helpers;
- JSON and multipart support;
- an abort timeout;
- credentials/cookie support when appropriate;
- consistent error parsing;
- request IDs;
- one controlled retry for safe idempotent reads;
- no automatic retry for mutations unless idempotency is implemented;
- offline detection;
- accessible loading, success, error, and retry feedback;
- protection against double submission.

Move page behavior out of inline scripts into page modules. Keep HTML semantic. Add stable IDs or `data-*` hooks without changing the visual layout.

#### Phase 2 — API contract and response consistency

Inventory the existing Worker contract first. Extend it without unnecessary breaking changes.

For new endpoints, prefer this successful response shape:

```json
{
  "data": {},
  "meta": {
    "requestId": "string",
    "generatedAt": "ISO-8601",
    "source": "string",
    "stale": false
  },
  "error": null
}
```

Use a consistent error shape:

```json
{
  "data": null,
  "meta": {
    "requestId": "string"
  },
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "A safe user-facing message",
    "details": {}
  }
}
```

Use correct HTTP status codes. Distinguish at least:

- `400` invalid request;
- `401` unauthenticated;
- `403` unauthorized;
- `404` missing resource;
- `409` state conflict/idempotency conflict;
- `413` upload too large;
- `415` unsupported media;
- `422` semantically invalid input;
- `429` rate limited;
- `502` upstream failure;
- `503` model/service unavailable.

All dates must be ISO-8601 in the API and displayed in `Asia/Dhaka`. Store timestamps in UTC. Include units in schemas and never mix acre/hectare, kg/ha/kg/acre, mm/cm, or wholesale/retail prices silently.

#### Phase 3 — D1 data model and migrations

Read existing migrations before adding new ones. Add forward-only numbered migrations for missing entities. Do not edit already-applied production migrations unless the repository explicitly proves they were never deployed.

Support the following logical data. Reuse equivalent existing tables and names when available:

- users and profiles;
- user settings and language;
- farms;
- fields, location, crop, area, unit, and optional geometry;
- field sample points;
- tasks and completion events;
- devices and device authentication;
- sensor readings with type, value, unit, quality, and timestamp;
- irrigation schedules, current state, and idempotent command records;
- notifications, read state, and in-app reminders;
- activity/audit log;
- market commodities;
- markets and coordinates;
- current and historical market prices with source, market, date, price type, and unit;
- user watchlists;
- market alerts;
- soil tests and test values;
- normalized BARC/SRDI soil reference data if not already present;
- soil recommendations and fertilizer plans or their reproducible inputs;
- AI conversations and messages;
- saved AI answers;
- uploaded-file metadata referencing R2 objects;
- curated agriculture knowledge sources and citations;
- seasonal crop calendar entries;
- government support/resource entries.

Schema requirements:

- foreign keys where D1 supports them;
- useful indexes for user/time, field/time, commodity/market/date, district/upazila, and conversation/time queries;
- uniqueness constraints for idempotency and natural keys;
- soft-delete only where recovery is useful;
- ownership checks on every user resource;
- no raw service tokens or plaintext passwords;
- source/provenance columns for agricultural and market data;
- `created_at` and `updated_at` where relevant.

Add deterministic seed data only for development/tests. Mark demo records with a `data_status` or equivalent field. Production endpoints must not call seeded demo data “live”.

#### Phase 4 — Production Worker capability

The following logical API must exist by the end. Existing route names may be preserved; add compatibility adapters if the current API differs. Public Worker paths should live under `/api/v1`; frontend calls should go through `/api/*`.

##### Health and metadata

- `GET /api/v1/health`
- `GET /api/v1/meta/config`
- `GET /api/v1/meta/sources`

Health must report component availability without leaking secrets.

##### Authentication and profile

- register;
- login;
- logout;
- current profile;
- update profile;
- update language/settings;
- safe session renewal if the existing architecture supports it.

Prefer secure, HTTP-only, `Secure`, same-site cookies for browser sessions through the same-origin Vercel rewrite, or preserve an existing secure bearer-token approach if already correctly implemented. Do not store long-lived sensitive tokens in `localStorage`. Protect passwords using the repository’s vetted edge-compatible password hashing implementation. Add expiration, rotation/revocation where applicable, and brute-force rate limiting.

Public pages must still load useful public information when logged out. User-owned writes must require authentication. If auth UI is missing, add a design-consistent modal/drawer or minimal page without altering the five-page visual identity.

##### Location

- list divisions;
- list districts by division;
- list upazilas by district;
- locate the nearest supported district/upazila from coordinates;
- return a normalized Bangladesh location object.

Use the repository’s Bangladesh location data and correct known naming variants. Do not claim that Bangladesh has only 63 districts if the maintained dataset covers all 64; resolve and document the discrepancy from actual source data.

##### Weather

- current conditions by coordinates or supported location;
- seven-day forecast;
- agricultural alerts derived from forecast thresholds;
- WMO code mapping in Bangla and English;
- sunrise/sunset, humidity, precipitation probability/amount, wind speed/direction, and source timestamp where available.

Use Open-Meteo as the no-key default. Validate latitude/longitude. Apply a timeout, cache successful results, support stale-if-error, and expose `meta.source`, `meta.generatedAt`, and `meta.stale`. Do not cache personalized data publicly.

##### Farms and fields

- list/create/update/archive farms;
- list/create/update/archive fields;
- field detail;
- field crop/area/location;
- optional field boundary/sample points;
- field comparison summary.

The current UI shows three fields, but real data must determine the number and names. A new account may receive a guided empty state, not invisible fabricated farms.

##### Tasks and activity

- list today’s tasks;
- create/update/complete/reopen/delete tasks;
- batch completion only for explicitly selected tasks;
- recent activity feed;
- activity entries for important mutations.

Checkbox changes must persist. “Mark task complete” must not complete every task blindly. Use optimistic UI only with rollback on failure.

##### Devices, sensors, and irrigation

- device list and online/offline status;
- latest readings grouped by sensor type;
- field soil moisture;
- device heartbeat age;
- irrigation status;
- irrigation schedules;
- create/cancel an irrigation command;
- command result/audit status.

If no hardware device is registered, the UI must show “No device connected” and a setup path. Do not display `12/12 Online` or `68%` as live information without real readings.

For real irrigation commands:

- require authentication and field ownership;
- require a registered authorized device;
- show a user confirmation;
- require an idempotency key;
- record requested, accepted, completed, rejected, and timed-out states;
- never report success merely because a button was clicked;
- provide a safe simulated device adapter only in clearly labelled development mode.

##### Notifications and reminders

- list notifications;
- unread count;
- mark one/all read;
- create and manage in-app reminders;
- weather, market, task, soil-test, device, and system notification types.

Browser Notifications may be offered with permission, but in-app notifications must work without them. Do not require paid SMS or email.

##### Market intelligence

- list commodities;
- current prices;
- price ticker summary;
- 7/30/90-day history;
- weekly high/low/change;
- district/market comparison;
- nearest markets by coordinates;
- watchlist CRUD;
- market alert CRUD;
- market insight/recommendation;
- report export data.

Each price must carry:

- commodity ID/name;
- market and district;
- date/time;
- value and currency;
- unit;
- wholesale/retail type when known;
- source and source URL when available;
- freshness status.

Do not label data “Live” unless it satisfies a documented freshness threshold. When current government feeds are unavailable, show the last verified observation and its date. Do not scrape a source that prohibits scraping.

Market recommendations must be evidence based. If an actual forecast model is available and validated, return model version, horizon, confidence/calibration, and factors. Otherwise compute a clearly labelled rule-based trend from sufficient history. If history is insufficient, return `insufficient_data`; never fabricate “SELL”, a confidence score, or a future percentage.

##### Soil intelligence

- list soil-supported locations;
- lookup by district/upazila;
- nearest lookup by coordinates;
- field’s latest soil test;
- create a manually entered/lab soil test;
- soil sample points;
- field comparison;
- health-score calculation with an explanation;
- nutrient status for N, P, K;
- pH, moisture, organic matter, texture, drainage, salinity where available;
- crop recommendations;
- fertilizer dose plan;
- next-test recommendation;
- report export data.

Migrate/reuse the existing BARC/SRDI-derived dataset instead of discarding it. Inspect the actual local SQLite/Excel/parser sources. Add a repeatable import script that:

- normalizes district/upazila/category names;
- records provenance;
- avoids duplicate imports;
- validates record counts and required columns;
- reports rejected rows;
- can target local D1 and production D1 only when explicitly authorized;
- does not commit a generated database.

Soil calculations must be deterministic and tested. Record the formula/rules and unit assumptions. Fertilizer advice is safety-sensitive: attach source, crop, season, area/unit, and a notice to verify with a local agricultural officer or soil lab. Never infer laboratory precision from a district-average dataset.

##### AI farming assistant

- create/list/open/delete conversations;
- submit a text question;
- add/remove crop and issue context;
- submit a crop image for disease/nutrient analysis;
- return answer sections, confidence semantics, related questions, and citations;
- save/unsave an answer;
- expose shareable text safely;
- supply context weather when requested;
- support Bangla, English, and basic Banglish normalization where existing utilities permit.

The default no-paid-key text path should use curated agricultural knowledge and deterministic retrieval. Use only sources actually present in or fetched by the system. Every cited URL/title must be real. Separate retrieved facts from generated recommendations. If evidence is weak, say so.

The image path must be:

```text
browser multipart upload
  -> Worker validation and authorization
  -> private R2 object or bounded streaming proxy
  -> authenticated AI-service inference
  -> normalized Worker response
  -> optional retention/deletion policy
```

Validate magic bytes, MIME type, extension, size, dimensions, and decompression risk. Generate non-guessable keys. Strip unnecessary metadata where practical. Do not make private uploads public. Document retention and provide deletion for user-owned uploads.

The AI service must:

- load real ONNX models during startup if they are valid;
- validate model input/output signatures;
- preprocess images exactly as model metadata requires;
- return model name/version and calibrated confidence if supported;
- return `model_unavailable`/HTTP 503 when a model is missing or invalid;
- never substitute random/sample predictions;
- enforce the Worker-to-service token;
- avoid logging uploaded image contents or secrets;
- have health/readiness endpoints;
- have unit tests for valid, invalid, and unavailable-model flows.

Crop, yield, or market ONNX models found in the repository may be exposed only after their schemas, preprocessing, outputs, and validation tests are understood. Do not infer an input order from filenames.

##### Global search and content

Provide a lightweight global search over fields, crops, markets, soil resources, support programs, settings destinations, and saved conversations. Return typed results with safe destination URLs. Search must work from the top command bar and with `Ctrl+K`/`Cmd+K`.

Provide real data or maintained local content for:

- seasonal crop calendar;
- government support programs;
- trusted data sources;
- agricultural resources;
- crop guides.

Each resource needs a title, short description, category, language, verified URL when external, and `updated_at`. Remove dead placeholder links.

### 6. Exact frontend behavior requirements

Keep the existing pages and connect them as follows.

#### 6.1 Home — `index.html`

Implement all of these:

- Header Home/Solutions/Insights/Resources navigation scrolls correctly.
- Header search opens global search and displays typed results.
- “Open Dashboard” and “Get Started” open the dashboard; if personalization requires auth, show auth/onboarding without blocking public data.
- The `EN` control toggles Bangla/English, updates its label, persists the preference, and updates dynamic content. Do not translate proper source names incorrectly.
- Hero weather card loads current weather for saved location, geolocation with consent, or a documented default selection.
- Hero soil card loads the selected field’s real/latest soil status or shows an honest empty state.
- Hero market card loads a recent selected/watchlisted commodity price and timestamp.
- Seasonal calendar tabs load the correct stage/timeline for Rice, Jute, Maize, and Vegetables.
- Weather alert comes from the weather alert endpoint and includes freshness/location.
- Government support rows and “View all” open a real resource drawer/list with real links.
- Crop intelligence comes from field/crop/weather/soil context or shows onboarding.
- Trusted-data “Learn more” opens source/provenance information.
- Live agriculture ticker uses recent market/weather data and stops calling stale data live.
- All loading/error/empty states preserve the card dimensions to avoid layout shift.

#### 6.2 Dashboard — `dashboard.html`

Implement all of these:

- Greeting uses authenticated profile name and local time; guest mode is labelled.
- User menu opens profile/settings/logout actions.
- Notification bell opens notifications, shows real unread count, and marks items read.
- Top search and keyboard shortcut use global search.
- Weather header, current weather card, and seven-day forecast share one normalized weather state.
- Alert banner shows a current alert; “View details” opens details/source/action guidance.
- Farm health is calculated from available crop, soil, water, device, and disease inputs; missing components are shown as missing and are not silently scored as healthy.
- Soil moisture comes from the most recent qualified sensor reading or a labelled soil-test/manual value.
- Irrigation switch reflects server/device state, confirms mutations, waits for command acknowledgement, rolls back on failure, and is unavailable when no device exists.
- “Manage irrigation” opens schedule/status controls and persists changes.
- Disease risk is based on available field/weather/disease information and exposes why.
- Sensor status uses real device heartbeat thresholds.
- “Your Fields” renders actual fields; selecting a field updates relevant page context.
- “View all fields” opens field management with create/edit/archive behavior.
- Task checkboxes persist individually.
- “Mark task complete” applies only to selected/pending task(s) and confirms the result.
- Forecast detail opens a real detailed view.
- Recent activity comes from persisted audit/activity events.
- Market-price mini list uses the market API and links to the selected commodity.
- Resources and Settings sidebar links open real views, not placeholders.

#### 6.3 Market — `market.html`

Implement all of these:

- Market search filters or searches commodities, markets, and districts.
- Weather chip uses shared current weather.
- Notification bell and user menu work consistently with Dashboard.
- Price ticker comes from current/recent price data with timestamps.
- Commodity strip is data-driven; selecting a commodity updates current price, change, high/low, chart, recommendation, district comparison, watchlist state, and insights together.
- 7/30/90-day buttons request and render the selected history range.
- Replace the decorative chart with a data-driven accessible chart while preserving its appearance. Reuse Chart.js if appropriate.
- Historical and forecast portions are visually distinguishable.
- “Create Alert” opens a validated alert form with commodity, market/district, condition, threshold, and enable state; it persists.
- “Export Report” downloads a useful CSV and/or print-ready report containing visible filters, source, units, and generation time.
- AI recommendation is real, rule-based, or unavailable; no fabricated confidence.
- Nearest market uses geolocation or saved coordinates and actual market coordinates.
- “View all” lists nearby markets.
- “Get Directions” opens a no-key directions link in a safe new tab with `noopener`.
- Watchlist is persisted per user; “Manage” adds/removes/reorders supported items.
- District comparison changes when the selected commodity changes.
- Insights are traceable to price/weather/season evidence.
- Prices always show `৳`, unit, price type if known, source, and observation date.

#### 6.4 Soil — `soil.html`

Implement all of these:

- Field selector is populated from the user’s actual fields.
- Selecting a field refreshes every soil card, test date, map/sample points, comparison, fertilizer plan, recommended crops, and next-test date.
- Location comes from the field record.
- Health score and radar are data driven.
- N/P/K/pH values, statuses, ideal ranges, and units come from a versioned calculation/knowledge rule.
- Missing lab values are displayed as unavailable, not replaced with district averages without a clear label.
- Compare Fields opens a selection/dialog and updates the comparison table.
- Download Report produces a report containing user/field, test/source, values, units, recommendations, caveats, and generation time.
- Sample pins are data driven and selectable; selected sample shows details.
- Field comparison handles any number of fields gracefully on small screens.
- Fertilizer plan reflects crop, season, area, soil values, and unit conversion.
- Recommended crop tiles open a real crop guide/detail view.
- “View all fields” and “View crop guide” work.
- Next soil-test date is calculated from the latest test/source/rule.
- “Set Reminder” persists an in-app reminder and requests browser notification permission only after an explicit user action.

#### 6.5 AI Search — `ai-search.html`

Implement all of these:

- “New Question” starts a clean conversation.
- Recent conversation list is persisted and selectable.
- “View all” opens full history with delete support.
- Ask/Photo/Voice tabs change the actual composer mode, not only CSS.
- Text Ask validates non-empty input and sends it to the assistant endpoint.
- Upload Photo provides file picker, drag/drop if appropriate, preview, remove, progress, validation, and submit.
- Voice uses browser speech recognition where supported; provide a clear fallback to typed input or recorded upload where implemented. Never fake transcription.
- Add Crop opens a crop selector; removable context chips work.
- Get Answer shows progress, prevents duplicate submission, supports cancellation, and renders the real response.
- Answer title, diagnosis/advice, confidence semantics, action plan, image, citations, weather context, and related questions are data driven.
- Confidence must represent a real model/retrieval measure and must not be presented as medical certainty.
- “Listen” uses Speech Synthesis for the currently displayed answer and toggles stop/resume appropriately.
- “Save” persists/unsaves the answer and updates state.
- “Share” uses Web Share when available and clipboard fallback otherwise.
- Trusted-source links are real, safe, and open with `noopener`.
- Clicking a related question submits or fills that real question.
- Weather context uses the same normalized weather API as other pages.
- Failure modes distinguish validation, offline, rate limit, upstream failure, insufficient evidence, and model unavailable.

### 7. No-dead-control audit

Add an automated check or Playwright assertion that inventories interactive elements across all five pages. The test must fail when:

- an anchor uses `href="#"` without an intentional, tested dialog action;
- a button has no click/form behavior and is not disabled with an explanation;
- a form can submit without validation;
- a visible live-data area never leaves hard-coded initial content after successful API loading;
- a keyboard-only user cannot activate an action;
- a user can trigger the same mutation multiple times accidentally.

It is acceptable for static navigation anchors to navigate normally. It is not acceptable to silence the test by adding empty handlers.

### 8. UI state and resilience requirements

Every async region must support:

- initial loading/skeleton;
- success;
- empty/onboarding;
- stale cached data;
- offline;
- recoverable error with Retry;
- unauthorized with sign-in action;
- rate-limited with retry timing where known;
- unavailable upstream/model state.

Use `aria-live` for important status changes. Preserve prior data while refreshing when safe. Show “Last updated” where freshness matters. Avoid full-page blocking spinners for independent cards.

Do not display raw stack traces, internal exception messages, secrets, SQL, or private IDs to users.

### 9. Localization

Implement a lightweight Bangla/English localization system for static labels and dynamic status values.

- Persist language per authenticated user and locally for guests.
- Default sensibly from profile/browser while allowing manual override.
- Use `Intl.DateTimeFormat` and `Intl.NumberFormat`.
- Keep database/API enum values language-neutral; translate at presentation time.
- Support mixed Bangla/English input for agricultural search without corrupting names.
- Do not use machine-generated nonsense translations.
- Tests must confirm the language toggle changes representative content on all five pages.

### 10. Security and privacy requirements

Implement and test:

- strict input validation and maximum lengths;
- output escaping and safe DOM construction; avoid interpolating untrusted HTML;
- ownership authorization for every user-owned resource;
- safe authentication/session expiry;
- login and sensitive-route rate limiting;
- CORS restricted to configured origins for direct Worker access;
- same-origin frontend API where deployed;
- upload size/type/content validation;
- private R2 access;
- SSRF protection for any server-side URL fetch;
- safe external-link protocols;
- SQL parameterization;
- request IDs and structured logs with secret/PII redaction;
- generic auth error messages;
- no sensitive caching in shared caches;
- reasonable Content Security Policy compatible with actual assets, preferably added after inventorying dependencies;
- `X-Content-Type-Options`, Referrer Policy, and existing security headers;
- dependency audit results documented, without making unrelated risky upgrades.

Do not log passwords, tokens, full authorization headers, uploaded images, precise user location unless operationally necessary, or full AI conversations by default.

### 11. Caching, reliability, and cost control

Use bounded caching appropriate to the data:

- locations/static content: long TTL with versioning;
- weather: short TTL, stale-if-error;
- market observations: TTL based on source freshness;
- health/status: very short or no shared cache;
- personalized/user data: private/no shared cache;
- AI responses/uploads: no shared cache unless safely content-addressed and privacy reviewed.

Add timeouts to all upstream calls. Abort work when the client disconnects where supported. Bound lists and paginate histories. Prevent unbounded AI/upload payloads. Return partial dashboard data if one independent service fails rather than failing the entire page.

### 12. Testing requirements

Tests are part of the deliverable, not optional polish.

#### Worker tests

Test at least:

- auth success/failure/expiry/authorization;
- validation boundaries;
- weather normalization, caching, timeout, stale fallback;
- market current/history/comparison and insufficient-history behavior;
- field ownership;
- task persistence;
- device heartbeat and irrigation idempotency;
- notification read state;
- soil lookup, units, health scoring, recommendations, and missing-data behavior;
- upload validation;
- Worker-to-AI-service authentication and normalized errors;
- rate limiting;
- consistent error envelopes.

Mock external services deterministically in tests. Do not make the normal test suite depend on live internet.

#### AI-service tests

Test at least:

- health and readiness;
- missing/invalid service token;
- model load success and failure;
- invalid file and oversized image;
- correct preprocessing shape/type;
- stable normalized result using a controlled fixture;
- explicit `model_unavailable`;
- text retrieval returns real citations or insufficient evidence;
- no random/fabricated fallback.

#### Frontend unit/integration tests

Test at least:

- API client error handling, timeout, and credentials;
- formatting and unit conversion;
- localization;
- safe DOM rendering;
- optimistic-update rollback;
- page controllers given fixture responses;
- empty/error/stale states.

#### End-to-end browser tests

Use the existing Playwright setup or extend it. Cover all five pages at desktop and mobile widths.

At minimum automate:

1. Home loads dynamic cards, calendar tabs change content, language toggle works, global search opens.
2. Dashboard loads partial/full data, field selection works, a task persists, notifications open, irrigation handles available and unavailable-device states.
3. Market commodity and range changes update the chart and tables, watchlist persists, alert creation validates, export downloads.
4. Soil field selection updates metrics, comparison works, report downloads, reminder persists.
5. AI text question creates a conversation and renders citations; image upload validates; model-unavailable state is honest; save/share/listen controls behave.
6. Unauthenticated protected actions open auth.
7. Offline/upstream failure exposes retry without destroying layout.
8. There are no uncaught console errors, broken images, failed same-origin asset loads, or horizontal overflow.
9. No-dead-control assertions pass.
10. Keyboard navigation reaches every interactive control.

Run HTML validation and `git diff --check`. Run the repository’s lint/typecheck/test/build commands. If a command cannot run, diagnose it and either fix the cause or report the exact external blocker; do not write “should pass.”

### 13. Observability

Add lightweight, privacy-conscious observability:

- request ID on Worker responses;
- structured server logs;
- endpoint/status/latency without sensitive payloads;
- AI inference duration and model version;
- upstream source failures;
- device command lifecycle;
- optional client error reporting hook that works without a paid vendor.

Do not add a paid observability dependency. Avoid noisy console logging in production.

### 14. Documentation and developer experience

Update or add:

- `docs/BACKEND_INTEGRATION_AUDIT.md`;
- API contract/OpenAPI or a precise endpoint document generated from actual routes;
- local setup instructions for frontend, Worker/D1, and AI service;
- `.env.example` files containing names and safe descriptions only;
- D1 migration and seed instructions;
- soil-data import instructions and validation counts;
- model setup/validation instructions;
- deployment checklist for Vercel, Cloudflare, and the AI service;
- backup/rollback notes;
- free-tier/quota limitations;
- data-source provenance and freshness rules;
- user-data/upload retention behavior;
- a feature traceability report showing every visible UI option and its final implementation/test status.

Documentation must match the code at completion. Remove or clearly mark stale contradictory claims rather than adding another conflicting architecture document.

### 15. Definition of done

You may report completion only when all of the following are true:

- All five pages retain the approved visual design.
- Every visible button, link, input, select, checkbox, tab, keyboard shortcut, and card action has useful tested behavior.
- No unexplained `href="#"` remains.
- No “live” value is fabricated.
- Home dynamic content is connected.
- Dashboard weather, fields, tasks, notifications, market summary, and available sensor/device states are connected.
- Irrigation is safe and honest with and without hardware.
- Market selection, ranges, chart, comparisons, watchlist, alerts, directions, and exports work.
- Soil fields, metrics, comparison, samples, recommendations, fertilizer plan, report, and reminder work with provenance/caveats.
- AI text, photo, conversation history, citations, related questions, listen, save, and share work, or expose an explicit tested unavailable state when a real model/capability is absent.
- Authentication and ownership checks protect private writes.
- Bangla/English toggle works across all pages.
- Loading, empty, stale, offline, error, unauthorized, rate-limited, and unavailable states exist where applicable.
- D1 migrations are forward-only and tested locally.
- External calls have timeouts and mocks.
- Worker, AI-service, frontend, and E2E tests pass.
- HTML validation, lint, typecheck, build, `git diff --check`, broken-link/asset checks, console-error checks, and responsive overflow checks pass.
- Documentation and feature traceability are complete.
- The working tree contains no secrets, user uploads, local databases, generated model artifacts, or unrelated changes.

### 16. Required final report format

When implementation and verification are complete, provide a concise evidence-based report with:

1. **Outcome** — what is now working.
2. **Architecture used** — frontend, Worker, D1/KV/R2, AI service, external free sources.
3. **Files changed** — grouped by frontend, Worker, AI service, migrations, tests, documentation.
4. **UI-to-API traceability** — link to the completed traceability document.
5. **Migrations** — IDs and what they add.
6. **Tests actually run** — exact commands and pass/fail counts.
7. **Manual browser verification** — pages, viewports, and flows checked.
8. **External configuration still required** — only real credentials/bindings/deployment approvals, with exact commands but no secret values.
9. **Known honest limitations** — for example, no physical device or unavailable model; never hide these.
10. **Git status** — confirm no unrelated changes or secrets.

Do not finish with vague statements such as “backend integrated” or “everything should work.” Include concrete evidence.

### 17. Decision policy while working

- Make reasonable reversible implementation decisions without repeatedly asking questions.
- Ask only when a missing decision would materially change product behavior, when real credentials are required, or before an irreversible/external action.
- If the repository already contains a better equivalent pattern, follow it and document why.
- If a requested capability cannot truthfully work without hardware, a valid model, or an external credential, build and test the honest unavailable/onboarding path and clearly identify the exact missing requirement.
- Do not use fake success to satisfy the UI.
- Do not stop at the first failing test; diagnose and fix in-scope failures.
- Preserve user changes and avoid destructive Git commands.
- Do not push or deploy without explicit approval.

Begin now by auditing the repository and existing behavior, then continue through implementation, testing, browser verification, and documentation until the definition of done is met.

## END PROMPT

---

## Suggested first message after pasting the prompt

If the coding agent asks whether it should begin, answer:

> Begin now. Work in the current repository, preserve the existing five-page design, implement the prompt phase by phase, and do not push or deploy without asking me first.
