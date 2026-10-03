# Zephyrus Relay

Relay is a responsive delivery operations application for Waypoint Group: **Store order → Dispatcher plan → Loader checks → Driver delivery/POD → Store receipt**. PostgreSQL holds operational state; the Driver can record cached-trip work during real network loss and reconcile afterward.

## Quick start for judges

Prerequisite: Docker Engine/Desktop with Compose v2. From the cloned repository root:

```sh
cp .env.example .env
# Set SESSION_SECRET to a random 32+ character value.
# Set POSTGRES_PASSWORD to a separate random URL-safe alphanumeric value.
docker compose up
```

PowerShell: use `Copy-Item .env.example .env` for the first command. Open **http://localhost:3001** once the app is healthy. `docker compose ps` shows readiness. The stack applies all migrations and safely bootstraps four accounts plus a historical delivery scenario. Subsequent starts preserve progress. `docker compose down` retains the named database volume; do not delete that volume to restart the app.

All four judge accounts use **RelayDemo!26**, via the ordinary login form:

| Email / employee ID | Role and scope |
| --- | --- |
| store@relay.demo / store | Store Manager, OUT004 |
| dispatcher@relay.demo / dispatcher | Dispatcher |
| loader@relay.demo / loader | Loader, Peliyagoda depot |
| driver@relay.demo / driver | Driver assigned to DEMO-2025-01-02-01 |

Follow the [complete numbered judge walkthrough](docs/walkthroughs/judge-walkthrough.md), including real network-offline delivery and receipt. It intentionally begins with seeded orders for **2025-01-02** because the reference calendar is historical. No clock override, browser reset or SQL mutation is required. To repeat from scratch, use a separate Compose project (`docker compose -p relay-second up`) and an unused APP_PORT; this creates a separate volume without deleting prior work.

**Verification status:** see [final report](docs/final-report.md) for exact executed checks and blockers. Docker commands require independent execution on a Docker-capable host; do not interpret native database testing as a passed container build.

## Architecture and repository

Vite builds HTML/CSS/vanilla JavaScript. Express serves the built frontend and same-origin API. Domain planning and operational services validate mutations; Prisma persists to PostgreSQL. A Service Worker caches only the public shell. Driver manifests/outbox use encrypted Dexie/IndexedDB; `/api/sync` calls the same operational service as online requests.

| Directory | Purpose |
| --- | --- |
| apps/web | Four-role application and offline client |
| apps/api | Express, authentication, routes, operational services |
| packages/domain | Order policy, allocation and feasibility engine |
| prisma | Schema, five migrations, safe seed and public judge reference data |
| tests | Domain, API, database, browser, responsive and offline regression |
| docs/designathon | Unmodified historical submission |
| docs/walkthroughs | Final judge guide and historical stage records |
| apps/product-page | Separate optional product page, not required for this stack |

## Local Node setup

Prerequisites: Node **24+**, npm, PostgreSQL **18** (tested), and an empty dedicated database owned by your configured user. From the root:

```sh
cp .env.example .env
# Configure DATABASE_URL and SESSION_SECRET. RELAY_DATA_DIR=prisma/judge-data.
npm ci
npm run db:migrate
npm run db:seed
npm run build
npm start
```

Open http://localhost:3001. `npm run dev` instead starts Vite at http://localhost:4173 with an API proxy; use the built app for offline demonstrations. The seed requires `RELAY_ALLOW_SEED=true` outside production. Container startup runs that opted-in seed as a separate bootstrap process before starting the production server. Missing migrations/data or failed seed stop startup.

The public [judge network](prisma/judge-data/README.md) is independently generated synthetic data, not the confidential competition CSVs. It has 120 outlets, 60 vehicles, two depots, travel/service references and 910 calendar days. Authorized official-data testing can set `RELAY_DATA_DIR=data` in a separate database with all five required CSVs under `data/General Data/`. Relative data paths resolve from the repository root, including workspace `npm start`. Never mix datasets in an existing operational database.

Repeat seed updates imported reference rows and creates missing seed records; it preserves existing passwords, orders, trips, proofs, receipts and status history. It is not a reset. Disable `RELAY_ALLOW_SEED` after bootstrap. Schema changes use versioned migrations, never a manual `db push` prerequisite.

## Configuration and deployment

[.env.example](.env.example) lists all runtime/build/test settings. `DATABASE_URL` is required locally; Compose constructs its internal URL. `SESSION_SECRET` is required in production and must remain stable while devices have pending work. `VITE_ENABLE_DEV_TOOLS=false` is the production default and Docker build setting. `RELAY_DEV_READS` and `RELAY_DEMO_ORDER_NOW` are development-only and rejected in production.

The Compose preview binds only **127.0.0.1** and explicitly sets `SESSION_COOKIE_SECURE=false` so normal login works on local HTTP. A public deployment must use HTTPS, `NODE_ENV=production`, `SESSION_COOKIE_SECURE=true`, a strong stable session secret, and `TRUST_PROXY=true` only behind one trusted HTTPS reverse proxy. PostgreSQL has no published host port. Keep seed accounts on an isolated judge deployment; provision/change credentials before real operational use. No public deployment was requested or performed. **Submission URL: add the team's HTTPS URL here after deployment and rerun the judge/offline guide on that origin.**

## Verification

```sh
npm run db:validate
npm run build
npm test
npm run test:db
npm run db:status
git diff --check
```

Use a dedicated seeded test database. The full suite runs files serially to avoid conflicting database mutations. `test:db` independently verifies imported CSV fidelity and idempotent seed. Browser tests require Chrome with a separate profile and debugging port 9222; `RELAY_CDP_URL` overrides it. For example in PowerShell:

```powershell
Start-Process -FilePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList @('--headless=new','--remote-debugging-port=9222','--user-data-dir=./artifacts/qa-chrome','--no-first-run','about:blank') -WindowStyle Hidden
npm test
```

Linux/macOS: launch your Chrome/Chromium binary with the same flags and an absolute temporary profile path. CDP tests create isolated browser contexts. The historical browser suite intentionally enables prototype controls for compatibility coverage; Stage 7/8 and final judge checks use the default built app. Some historical regression assertions require authorized competition references; the final judge test uses the public network. See the final report for exact commands, datasets and counts.

For acceptance of the public scenario, configure a **separate fresh** database with `RELAY_DATA_DIR=prisma/judge-data`, migrate/seed/build it, start the QA Chrome instance, then set `RELAY_JUDGE_TEST=true` and run `npm run test:judge`. This intentionally completes the seeded route and both Store receipts, verifies all eight viewport widths and real network-offline reconciliation, and reruns seed to prove progress is retained. It refuses an already advanced main trip; it does not reset data. Do not enable this flag on the database you intend to demonstrate manually.

## Assumptions, limitations and Designathon continuity

Planning enforces weight, volume, refrigeration, van-only access, depot, delivery windows, trip/time limits and weekly fuel quota. District free-flow travel plus service allowances are estimates, not traffic routing or optimization forecasts. Deferrals persist with explanations; release revalidates atomically. Loading shortfalls and delivery exceptions block completion until resolved. POD verifies full expected quantities; partial-delivery inventory write-offs and split PODs are not implemented.

Only the Driver supports durable offline mutation. Start/finish reconciliation and initial login/cache acquisition need connectivity; Loader and Store mutations require online service. Browser storage deletion/eviction can lose unsynchronized work. Another account cannot unlock the former Driver's encrypted vault. Unresolved conflicts remain visible and require operational resolution; there is no silent overwrite/discard.

The historical calendar ends 2026-06-28. New real-clock ordering needs an authorized later calendar import; the default walkthrough uses existing historical orders. For an optional local new-order demo only, set `RELAY_DEMO_ORDER_NOW=2025-01-03T15:59:00+05:30` with `NODE_ENV=development`, restart the API, then remove it afterward. Assisted allocation does not assign a Driver; the documented seed route is assigned. Driver assignment administration, inventory integration, real contact/address data and live maps/routing are outside this implementation. Stock suggestions remain illustrative.

The original visual language and field interaction hierarchy remain. Real authentication replaces account/role switching; PostgreSQL replaces browser operational storage; server feasibility/release replaces planning simulation; released manifests replace field fixtures; real SW/IndexedDB sync replaces the offline toggle. Production Dispatcher uses a date/queue/saved-trip layout to expose persisted multi-trip planning. The [fidelity and requirements audit](docs/final-audit.md) classifies all meaningful departures. Historical Day-5 assets were not rewritten.

Required documentation: [architecture](docs/architecture.md), [data model](docs/data-model.md), [AI disclosure](docs/ai-disclosure.md), [judge walkthrough](docs/walkthroughs/judge-walkthrough.md), [offline behavior and exact DevTools steps](docs/walkthroughs/stage-08-offline.md), [final report](docs/final-report.md).
