# Zephyrus Relay — Tech-Triathlon 2026

Relay is Waypoint Group's delivery operations system: Order → Plan → Load → Deliver → Confirm receipt. The current application began as Designathon work and is now the frontend foundation for the Hackathon system. It demonstrates the four official user roles and uses the supplied synthetic network conventions for outlets, vehicles, depots, access, temperature, capacity and delivery windows.

The live HTML, CSS and vanilla JavaScript frontend uses Vite in `apps/web/`. The Express API is in `apps/api/`, shared domain constants are in `packages/domain/`, and the PostgreSQL schema, migrations and seed are in `prisma/`. Historical Day-5 material is in `docs/designathon/`; current implementation walkthroughs are in `docs/walkthroughs/`, and the project guide is in `docs/guide_temp.md`. The competition datasets are in `data/`, which is intentionally Git-ignored and never served by the web application. Designathon screenshots and documents may differ slightly from the current frontend because the application evolved afterward. The design case study is part of that historical documentation, not the live web application.

## Run

```powershell
npm ci
npm run dev
```

Run these commands from the repository root, then open **http://localhost:4173**. Workspace hashes (`/#store`, `/#dispatch`, `/#loader`, `/#delivery`) respect the signed-in account; another role hash returns to your own workspace.

Vite runs on port 4173 and proxies `/api/*` to Express on port 3001. Use `npm run dev:web` and `npm run dev:api` for separate terminals. For deployment, run `npm run build`, configure `NODE_ENV=production` and a random `SESSION_SECRET` (32+ characters), then `npm start` behind HTTPS. For a local built-app preview, omit `NODE_ENV=production` and open http://localhost:3001. Optional configuration examples live in each application's `.env.example`.

See [Stage 01 foundation](docs/walkthroughs/stage-01-foundation.md) for the frontend architecture. [Stage 02 data](docs/walkthroughs/stage-02-data.md) covers PostgreSQL setup, private dataset ingestion, migrations and development read APIs; [the data model](docs/data-model.md) documents the persisted entities.

For database setup, configure root `.env` from `.env.example`, then run `npm run db:migrate`, `npm run db:seed` (requires `RELAY_ALLOW_SEED=true`) and `npm run db:counts`. Stage 4 requires the API and database for login and Store Manager orders. See [Stage 04 orders](docs/walkthroughs/stage-04-orders.md) for the server-side 16:00 Asia/Colombo cutoff, shared-calendar operating-date validation, scoped APIs and persistence walkthrough. The UI suggests the earliest open operating date; closed or unlisted dates return `INVALID_DELIVERY_DATE` from the server. The authoritative source and imported coverage both end on 2026-06-28 (910 rows). For a seeded judge walkthrough, explicitly configure the non-production server ordering clock with `RELAY_DEMO_ORDER_NOW=2025-01-03T15:59:00+05:30` as documented in Stage 04; unset it for real server time. Dispatcher and field screens still use prototype records. Development data APIs require `RELAY_DEV_READS=true` and authenticated Dispatcher access over loopback; keep them disabled outside local development.

## Authentication and seeded accounts

Run migrations and seed before signing in. All four development accounts use **`RelayDemo!26`**; the seed stores independently salted bcrypt hashes in PostgreSQL. These credentials live in server seed code and documentation only.

| Email / employee ID | Role |
| --- | --- |
| `dispatcher@relay.demo` / `dispatcher` | DISPATCHER |
| `loader@relay.demo` / `loader` | LOADER |
| `driver@relay.demo` / `driver` | DRIVER |
| `store@relay.demo` / `store` | STORE_MANAGER |

Use **Account > Sign out**, then enter another account's credentials. There is no account picker or authentication shortcut. Identity comes from `/api/auth/me`; the HttpOnly session cookie references PostgreSQL session storage. localStorage cannot authorize API requests. Set a random `SESSION_SECRET` (32+ characters) to retain sessions across API restarts; production requires it and HTTPS. See [Stage 03 authentication](docs/walkthroughs/stage-03-auth.md) for cookies, RBAC, scoping and verification.

`VITE_ENABLE_DEV_TOOLS=false` is the default. Setting it to `true` enables the simulated connectivity control for prototype evaluation only. It does not bypass login or change roles. Rebuild after changing a Vite flag.

## A complete judging walkthrough

1. **Store:** choose **Use recommended quantities**, adjust cartons with the steppers, and **Review order → Place order**. The replenishment creates **ORD-2847** for **Waypoint Fresh · OUT006**, shows the official 16:00 cutoff, and carries weight, volume and temperature needs into planning.
2. **Dispatch:** assign **ORD-2847** to **R-07 / Fresh / Colombo**, review all seven feasibility groups (weight, volume, temperature, outlet access, fuel quota, trips & time, delivery windows), then **Confirm plan → Confirm & release**. The default vehicle is the supplied-fleet-aligned **VEH003** reefer truck. Try the van-only OUT001 order to see access validation, record a reasoned deferral, or open the 10-week capacity outlook.
3. **Warehouse:** load the last delivery stop first, following the numbered manifest. Expand a shipment to check its products. Try **Missing / issue**, select a problem, then resolve it with a note. **Confirm loaded** advances the sequence; **Complete loading** becomes available once every shipment is checked.
4. **Delivery:** **Start route**, navigate or open the sample contact details, record arrival, then verify the delivery. A receipt requires the full carton count, the verification checkbox, a recipient and delivery time. Simulate lost connectivity to see the named degradation and recovery state.
5. **Store → Order tracking:** the same order shows the Dispatch-calculated **Expected arrival**, delivery window, route and vehicle, then the Driver POD after delivery. Open **View receipt**, check the cartons and choose **Confirm receipt**; only then do received cartons update stock and replenishment suggestions.
6. **Store → Dispatch issue path:** on a delivered OUT006 order choose **Report an issue**, select a type and enter useful details. Return to **Dispatch → Route** to see the completed delivery and separate Store receipt follow-up. The activity control records the shared handoffs.

Use **Account > Sign out**, then log in with the next employee's credentials between steps.

## Useful states to demonstrate

- **Delivery exceptions:** report Store closed, Recipient unavailable, Damaged goods, Partial delivery, Delivery refused or Access delayed. **Save & return later** holds the order open and advances to another stop. Outstanding stops remain visible; a return visit requires a resolution note and a new arrival. A route with deferred stops is never reported as complete.
- **Named degradation — Connection lost during delivery:** use the connectivity control in Warehouse or Delivery. The live example uses the Colombo route; coverage loss is especially relevant in hill country, along the Kandy corridor and in rural districts. Loading, issue resolutions and receipts persist through refresh, with last-sync and pending-update feedback. Reconnecting reconciles the simulated queue. Dispatch route changes are unavailable while offline.
- **Planning constraints:** weight, volume, refrigeration, van-only access, depot, fuel quota, trip limit and Fresh’s pre-dawn time budget are visible. Incompatible vehicles and assignments are blocked with an explanation.
- **Explainable deferral:** select an unassigned order, choose **Defer**, record the reason and impact, and see the decision shared with the store.
- **Validation and empty states:** clear search results, try an empty order, exceed vehicle capacity, leave resolution details blank, or enter an incorrect proof-of-delivery count. Each state explains the next useful action.
- **Responsive planning:** desktop exposes queue, route and vehicle together. Tablet and mobile use **Orders / Route / Vehicle** tabs; arrow keys, Home and End also navigate the tabs.

## Design and capture

The four workspaces share warm neutral surfaces, deep green actions, restrained status colors, readable operational type and a compact order lifecycle. Mobile Store uses product rows recomposed as touch-friendly cards and an order summary above navigation. Warehouse prioritizes loading sequence on tablets. Delivery uses a single next-stop view, an optional route overview and a primary action above the safe-area-aware navigation. Toasts occupy a separate space above the action bar.

Interface content is real DOM text, grouped using Grid and Flexbox. Small route and vehicle illustrations use SVG; the application itself is not a flattened image or canvas. Shared tokens and patterns live in `apps/web/src/styles/styles.css`; role styling is in `apps/web/src/styles/dispatch.css`, `apps/web/src/styles/store.css` and `apps/web/src/styles/field.css`. `apps/web/src/scripts/script.js` and `apps/web/src/scripts/workspace.js` manage the shared state and shell; the corresponding view JavaScript files contain their screens and interactions. The system-font stack keeps the prototype self-contained.

Dialogs have accessible names, keyboard focus containment and focus restoration. Controls provide visible focus, labeled inputs and status text. Touch targets are enlarged in the field interfaces and reduced-motion preferences are respected.

## Prototype boundaries

Store Manager orders and their status/history are backed by PostgreSQL. Stock cover, catalogue availability, suggestions, prototype dispatcher/field routes, contacts, forecast values and synchronization remain simulated. The prototype uses official field names and representative records, but it does not load the confidential CSV files into the browser. Prototype dispatcher and field data persists in this browser’s `relay-v1` localStorage entry; Store orders use the API exclusively. Stage 2 added PostgreSQL/Prisma and private network ingestion. Stage 3 added authentication; Stage 4 connects Store ordering and status tracking to that backend. Allocation and real offline synchronization remain later work. There is no offline mutation synchronization, Service Worker or IndexedDB sync; Store orders can be read from another authenticated session through the API. Offline mode demonstrates the experience rather than providing real offline infrastructure.

One **R-07** Fresh trip is editable and can be released during each demo. **R-12 Style** and **R-15 Tech** are scope previews. Fleet selection uses three representative available vehicles from the supplied Peliyagoda fleet. Suggestions, forecast values, time budgets and schematic maps illustrate decisions; they do not claim optimization or Datathon predictions. New orders placed after release remain queued until a demo reset. Navigation opens an external map search. Partial deliveries remain outstanding for reconciliation; they do not generate a completed receipt.

## Verification

First apply migrations, seed the local database and run `npm run build`. `node --test tests/auth.test.js` exercises real PostgreSQL sessions and RBAC. `npm run test:foundation` runs API, Vite proxy and static-security tests with temporary servers. `npm run test:data` covers CSV validation and enum consistency; `npm run test:db` validates the seeded network against a dedicated PostgreSQL development database as described in the Stage 2 walkthrough. For the full suite, use Node 24 and start a separate Chrome debugging browser. Browser tests launch isolated Vite/API servers with a fixed order clock inside calendar coverage and enable developer controls for the retained offline-simulation assertions:

```powershell
$browserProfilePath = Join-Path (Get-Location) '.browser-qa'
Start-Process -FilePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList @('--headless=new','--disable-gpu','--remote-debugging-port=9222',"--user-data-dir=`"$browserProfilePath`"",'--no-first-run','about:blank') -WindowStyle Hidden
npm test
```

The dependency-free test opens its own browser tab and restores previous Relay prototype data afterward; authentication tests use and log out of the isolated QA browser session. It never clears unrelated localStorage. Optional `RELAY_URL` and `RELAY_CDP_URL` environment variables override the server and debugging endpoints.

Coverage includes login validation, all four credentials, role/hash gating, sign out, session refresh, state-preserving logout/login, login layouts at 1440/1024/430/390/360px, and the same order across all four roles; search and filters; quantity bounds and steppers; dialog keyboard behavior; mobile planning tabs; vehicle selection and capacity rejection; reverse loading; issue resolution; offline reload; deferred delivery stops and return visits; receipt validation; Store delivery confirmation; runtime errors; and layout overflow across **360, 390, 430, 768, 834, 1024, 1280 and 1440px**. Active Delivery checks verify that navigation, primary actions and toast messages do not overlap at 360–430px.

Full-page screenshots are written to ignored `artifacts/`, including Store 1440/430/390, Dispatch 1440/1024/390, Warehouse 834/768 and Delivery 430/390/360. Additional captures show planning tabs, delivery exceptions and completed receipts. Mobile `-viewport` images preserve the actual visible screen for checking fixed controls.

Current authentication verification: [Stage 03 walkthrough](docs/walkthroughs/stage-03-auth.md). The older P3 walkthrough describes historical Designathon behavior.
