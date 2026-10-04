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
| driver@relay.demo / driver | Driver assigned to TRIP-2025-01-02-01 |

## Numbered judge walkthrough

Judge mode is explicit: **RELAY_JUDGE_MODE=true** with **RELAY_JUDGE_ORDER_NOW=2025-01-01T15:00:00+05:30**. The UI displays this fixed historical business date. It enables new orders using the original supplied calendar in an isolated judge database; login/session expiry and actual delivery timestamps still use real time. No OS clock change or browser console command is needed.

1. Start the fresh seeded stack, open the app, and sign in as **store** using **RelayDemo!26**. In Replenishment, select Ambient, Chilled or Frozen, add full cartons, and request **2025-01-03**. Review and place the order; note its reference in Order tracking. Separate temperature categories use separate orders.
2. Sign out and sign in as **dispatcher**. Load **2025-01-02** to inspect the seeded main route **TRIP-2025-01-02-01**, van-only order and oversized deferred order. Read the calendar context and saved deferral explanation. Select the van-only order and validate a truck to demonstrate rejection.
3. Click Allocate orders (enable Retry deferred orders to record another constrained attempt). Review each draft, choose an active Driver, and save. Confirm plan stays disabled until every draft has a Driver. Select the main trip, retain a feasible departure (04:45), then Confirm plan. Validation rechecks every trip before release.
4. Sign in as **loader**, select the main trip, inspect reverse loading order, and check all shipments. To demonstrate an issue, record missing/damaged goods with a note, resolve it, and recheck. Complete loading only when all checks pass.
5. Sign in as **driver**, select the main trip, wait for its cached/offline-ready state, and Start route. Arrive at the first stop, verify quantities, and save both OUT004 delivery proofs with recipient details.
6. In browser DevTools Network, select Offline. Reload and continue to OUT005 using the cached route. Record arrival and POD, reload again, and verify pending work remains. Restore connectivity; wait for zero pending actions and server-confirmed completion. Never delete browser storage while actions are pending.
7. Sign in as **store**. Open the two delivered OUT004 orders, inspect proof/receipt details, report and resolve a discrepancy if desired, and confirm receipt. Refresh to verify persistence. Dispatcher can reload the day to see completed delivery progress.
8. As Dispatcher, load January 2, choose **Move to later run** on the deferred oversized order, select **2025-01-03**, give a reason and explanation, and save. The destination queue opens. Store tracking retains the original requested date and decision history. Moving the oversized order does not make it feasible: allocation must defer it again until a valid operational resolution is possible.
9. Load **2025-01-03**, allocate the new Store order from step 1, assign a Driver to each draft and release. Complete Loader → Driver → Store handoffs for that new order as above. A frozen/chilled order must use a reefer; ambient vehicles are rejected for it.

For a repeat walkthrough, use a separate fresh database/Compose project and an unused APP_PORT. Seed preserves existing progress. Additional offline details are in [the detailed guide](docs/walkthroughs/judge-walkthrough.md).

**Verification status:** see [submission readiness](docs/submission-readiness.md). [Stage 10](docs/stage10-report.md) and [Stage 9](docs/final-report.md) are historical verification records.

## Architecture and repository

Vite builds HTML/CSS/vanilla JavaScript. Express serves the built frontend and same-origin API. Domain planning and operational services validate mutations; Prisma persists to PostgreSQL. A Service Worker caches only the public shell. Driver manifests/outbox use encrypted Dexie/IndexedDB; `/api/sync` calls the same operational service as online requests.

| Directory | Purpose |
| --- | --- |
| apps/web | Four-role application and offline client |
| apps/api | Express, authentication, routes, operational services |
| packages/domain | Order policy, allocation and feasibility engine |
| prisma | Schema, six migrations, safe seed and exact supplied reference data |
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

The bundled [judge network](prisma/judge-data/README.md) contains exact supplied operational CSVs. Its SHA-256 manifest verifies packaging. Both native setup and Compose use these references by default. The imported fleet includes ambient and refrigerated vehicles, mall access windows, and original calendar context. Earlier versions used simplified replacement data: upgrade using a fresh database. Seed refuses differing existing references instead of changing data under saved operations. The local data directory remains an optional identical source via RELAY_DATA_DIR=data.

Repeat seed updates imported reference rows and creates missing seed records; it preserves existing passwords, operational progress, proofs, receipts and status history. Stage 10 upgrades only the original application seed's account/product/order/trip labels to remove simulation wording. It is not a reset. Disable `RELAY_ALLOW_SEED` after bootstrap. Schema changes use versioned migrations, never a manual `db push` prerequisite.

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

An optional `RELAY_WEB_ROOT` absolute directory lets QA serve an isolated production build without replacing the normal `apps/web/dist`. Leave it unset for ordinary local setup and deployment. Test databases must use the same packaged references. The full suite now exercises frozen ordering, server catalogue rejection, disclosed production judge mode, deferred carry-forward through the UI/API, and release readiness.

```powershell
Start-Process -FilePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList @('--headless=new','--remote-debugging-port=9222','--user-data-dir=./artifacts/qa-chrome','--no-first-run','about:blank') -WindowStyle Hidden
npm test
```

Linux/macOS: launch your Chrome/Chromium binary with the same flags and an absolute temporary profile path. CDP tests create isolated browser contexts. The historical browser suite intentionally enables prototype controls for compatibility coverage; Stage 7/8 and final judge checks use the default built app. Some historical regression assertions require authorized competition references; the final judge test uses the supplied network. See the final report for exact commands, datasets and counts.

For acceptance of the supplied scenario, configure a **separate fresh** database with `RELAY_DATA_DIR=prisma/judge-data`, migrate/seed/build it, start the QA Chrome instance, then set `RELAY_JUDGE_TEST=true` and run `npm run test:judge`. This intentionally completes the seeded route and both Store receipts, verifies eleven viewport widths and real network-offline reconciliation, and reruns seed to prove progress is retained. It refuses an already advanced main trip; it does not reset data. Optional `RELAY_JUDGE_BASE_URL` targets a running isolated app backed by the same test database, including Docker. Do not enable this flag on the database you intend to demonstrate manually. The full suite also exercises a newly submitted frozen order through all four production views in `tests/product-workflow.test.js`, using the same judge-clock configuration function as production startup.

## Assumptions, limitations and Designathon continuity

Planning enforces weight, volume, refrigeration, van-only access, depot, delivery windows, trip/time limits and weekly fuel quota. Supplied district travel plus service allowances are estimates. Calendar monsoon days apply a documented conservative 20% travel-time allowance, including return travel; distance/fuel calculations remain distance-based. Payday, festival/ramp and weekend context are shown for Dispatcher review; actual submitted quantities determine demand, without fabricating forecasts. Deferred orders can move to a later operating day with a reason, original requested date and history retained. Release revalidates atomically. Loading shortfalls and delivery exceptions block completion until resolved. POD verifies full expected quantities; partial-delivery inventory write-offs and split PODs are not implemented.

Only the Driver supports durable offline mutation. Start/finish reconciliation and initial login/cache acquisition need connectivity; Loader and Store mutations require online service. Browser storage deletion/eviction can lose unsynchronized work. Another account cannot unlock the former Driver's encrypted vault. Unresolved conflicts remain visible and require operational resolution; there is no silent overwrite/discard.

The supplied calendar ends 2026-06-28. Default judge setup explicitly enables a historical business clock for ordering, including production deployments with only seeded demo accounts. A visible banner discloses it. Set RELAY_JUDGE_MODE=false for real operations; current ordering then needs authorized current calendar coverage. RELAY_DEMO_ORDER_NOW remains a separate development-only option and must not be combined with judge mode. Assisted allocation creates unassigned drafts; release requires active Driver assignment. The server catalogue owns carton weight, volume and temperature; it includes frozen goods. Account provisioning, Driver availability optimization, inventory integration and live maps remain outside this implementation.

## Significant departures from Designathon

The screenshot typography, green/off-white palette, rail navigation, card treatment, Store basket, Loader sequence, Driver bottom actions and receipt sheets remain the presentation foundation. All fourteen submitted screenshots were opened before Stage 10 UI edits; the [Stage 10 fidelity audit](docs/stage10-report.md) records the per-screen classification. Historical Day-5 assets and competition datasets were not rewritten.

| Original design | Final behavior | Reason |
| --- | --- | --- |
| Account/role switcher | Ordinary role-scoped login and sign-out | Authentication and authorization require real sessions; no authentication screenshot exists. |
| Single illustrative Dispatcher run | Queue / route / vehicle panels with saved-trip selector, day picker, assisted allocation, draft Driver/vehicle/sequence review and Confirm plan | Preserve screenshot composition while exposing actual multi-trip planning and validated release. |
| Per-order illustrative assign/defer | Assisted allocation plus recorded reasons, history, retry and Dispatcher carry-forward to a later operating date | The existing feasibility engine decides full-order placement; a cosmetic manual decision must not bypass constraints. |
| Route drawing, sample addresses/contacts and navigation | Persisted stop sequence, outlet/district and estimated arrival; ungrounded map/contact buttons omitted | Reference records contain no street address, phone number, coordinates or routing service. |
| Stock counts, stock health and suggested quantities | Searchable catalogue, full-carton quantities and basket; stock simulation only behind development build flag | Inventory quantities and recommendation feeds are unavailable. |
| Simulated offline / reconnected state | Compact live connection banner, encrypted outbox, real pending/conflict states and Sync now | Actual network loss and durable reconciliation replace a toggle; pending work is never presented as server completion. |

Existing working exceptions, POD verification, receipt discrepancies, refresh, retries and account isolation remain available. These are functional extensions styled with the submitted patterns. Only the Driver supports durable offline mutations.

Required documentation: [architecture](docs/architecture.md), [data model](docs/data-model.md), [AI disclosure](docs/ai-disclosure.md), [judge walkthrough](docs/walkthroughs/judge-walkthrough.md), [offline behavior and exact DevTools steps](docs/walkthroughs/stage-08-offline.md), [final report](docs/final-report.md).
