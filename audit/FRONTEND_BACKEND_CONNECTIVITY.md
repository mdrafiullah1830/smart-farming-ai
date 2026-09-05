# Frontend, localization and API connectivity audit

Audit date: 2026-08-29

## UI research decision

The updated visual system uses an adaptive field-intelligence layout: bottom
navigation on phones, a wider workspace on tablets, and a navigation rail on
desktop. This follows the official Material adaptive guidance while keeping a
Bangladesh-specific forest, jute, harvest and water palette. Dashboard cards
are now quieter and data-first, following IBM's principle that a visualization
should communicate its purpose at a glance.

References:

- https://developer.android.com/codelabs/adaptive-material-guidance
- https://m2.material.io/components/navigation-rail
- https://www.ibm.com/design/language/data-visualization/overview/
- https://www.w3.org/TR/geolocation/

## Localization coverage

| Page | Bangla/English status | Findings |
|---|---|---|
| `index.html` | Good | Shared `sfLang` preference and a substantial BN/EN dictionary exist. |
| `dashboard.html` | Partial | Main labels translate, but several map, crop-result, dynamically generated and validation strings remain hard-coded. |
| `soil.html` | Partial/Good | Main form and report labels translate; some generated feature values and district names remain source-language data. |
| `market.html` | Partial | Shared language preference and the primary header, hero, search, tabs and crop names translate; calculator/detail strings still need dictionary migration. |
| `ai-search.html` | Partial/Good | Shared language switch, search states and generated result headings translate; upstream answer content remains source-language data. |

Conclusion: language state is not consistently implemented across every page.
The next localization milestone is to move all UI strings into one shared
dictionary module and add the same switch to Market and AI Search.

## Frontend-to-Worker API matrix

Vercel rewrites `/api/*` to Cloudflare Worker `/api/v1/*`.

| Frontend capability | Requested route | Worker route | Status |
|---|---|---|---|
| Register | `POST /auth/register` | Exists | Connected; compatibility response fields added. |
| Login | `POST /auth/login` | Exists | Connected; compatibility response fields added. |
| Profile | `GET /auth/profile` | Exists | Connected for the current read-only profile UI. |
| Google login | `POST /auth/google` | Missing | Backend implementation required. |
| District list | `GET /districts` | Exists | Connected for list consumers. |
| District detail | `GET /district/:id` | Exists | Connected; crop/weather enrichment remains future work. |
| Weather | `GET /weather` | Exists | Connected; Open-Meteo is normalized to the dashboard schema. |
| Location hierarchy | `/locations/divisions`, `/zillas`, `/unions` | Exists | Division/district connected; unions depend on D1 upazila seed coverage. |
| Soil summary | `GET /soil/summary` | Exists | Connected only for the new query contract. |
| Soil page routes | `/soil/districts`, `/upazilas`, `/features`, `/nearest`, `/crop-recommendation` | Exists | Connected; useful results depend on importing the local soil dataset into D1. |
| Market prices | `GET /market/prices` | Exists | Contract aligned; useful live content depends on D1 market data imports. |
| Market districts/history | `/market/districts`, `/market/history/:crop` | Exists | Compatibility responses exist; history data ingestion remains. |
| Notifications | `GET /db/notifications` | Exists | Connected with an empty-state response; creation/delivery remains. |
| Chatbot | `POST /chat` | Exists | Connected to a clearly labelled curated guidance baseline. |
| Dynamic crop recommendation | `POST /crop/recommend-dynamic` | Exists | Connected to a clearly labelled rule-based baseline. |
| Disease UI analysis | `POST /disease/analyze` | Missing | Upload exists at `/uploads/disease`; inference waits for the trained model. |
| Disease upload | `POST /uploads/disease` | Exists | Requires login and raw JPEG/PNG/WebP body. Current UI sends multipart, so contract must be aligned. |
| AI search | `GET /ai-search` | Exists | Connected to a safe curated response and official AIS source; live web synthesis remains future work. |
| Worker → Render health | `GET /integrations/ai/health` | Exists | Connected; model currently reports unavailable until training/deployment. |

## Priority backend work

1. Add a frontend compatibility layer or migrate every page to one typed API contract.
2. Normalize auth responses and add Google authentication or remove the button.
3. Normalize Open-Meteo into the dashboard weather schema.
4. Implement location and soil compatibility routes backed by D1.
5. Seed/import market data and add history/district endpoints.
6. Add notification, chatbot, crop-recommendation and AI-search APIs.
7. Align disease upload format; activate inference only after the model is supplied.

## Geolocation policy

The app stores the approved coordinates locally for two hours. During that
window it does not call the Geolocation API again. After expiry it requests a
fresh position. The browser—not the website—controls whether that request
shows a permission popup, because permission lifetime is user-agent policy.
Testing should use the HTTPS Vercel origin; `file://` permission persistence is
browser-dependent and can produce repeated prompts.
