# Stage 04 — persisted Store Manager orders

## Setup and login

Use the dedicated local PostgreSQL development database configured in `.env`. Run:

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Seeding requires `RELAY_ALLOW_SEED=true`; do not seed a production database. The migration adds status history and snapshots existing orders without deleting or resetting them. Keep a stable `SESSION_SECRET` to retain login sessions across API restarts.

Open http://127.0.0.1:4173 and sign in as **store** / **RelayDemo!26**. Identity and the assigned outlet come from PostgreSQL. The supplied seed assigns the Fresh Store Manager to **OUT004**; the screen uses the actual assignment, not the prototype's hardcoded OUT006. Account → Sign out remains the way to change employees.

## Explicit judge ordering clock

The authoritative file `data/General Data/calendar.csv` contains **910 rows**, from **2024-01-01 through 2026-06-28**, including **770 operating dates** from **2024-01-01 through 2026-06-27**. PostgreSQL was checked before this correction: its 910 dates and operating flags match the source exactly. This is a source coverage limitation, not a truncated import. No dates have been added.

For a fresh seeded local judge walkthrough, explicitly set this in root `.env` before starting the API:

```dotenv
RELAY_DEMO_ORDER_NOW=2025-01-03T15:59:00+05:30
```

The API reuses the existing server-side `orderClock` dependency and logs that ordering time is fixed. Startup requires the configured Asia/Colombo business date to exist as a SUPPLIED CalendarDay; invalid/unlisted values fail startup. Production rejects this configuration. The instant stays fixed until configuration is changed and the API restarted; it does not advance with elapsed time. No HTTP clock setter exists, and browser/client timestamps cannot override it. This changes only the ordering clock, not authentication/session expiration or Dispatcher/Loader/Driver prototype clocks.

The shared clock controls today's date, the exact 16:00 cutoff, and the earliest delivery-date search through PostgreSQL. This example suggests the supplied operating Saturday **2025-01-04**. To demonstrate cutoff, restart with **2025-01-03T16:00:00+05:30**: tomorrow is closed and the default advances past non-operating Sunday to **2025-01-06**. A retained January 4 draft is rejected with quantities preserved. Unset `RELAY_DEMO_ORDER_NOW` and restart to restore real server time. Seeding alone never enables a fake clock. Real-time ordering after source coverage still requires an authoritative dataset extension.

## Place and reload an order

1. In Replenishment, choose **AMBIENT**, a future operating delivery date, and carton quantities. Review order → Place order.
2. Confirmation displays the server-generated order number, temperature and requested delivery date. “Confirmed for planning” does not mean scheduled.
3. In Order tracking, open Order details. The persisted lines and initial CONFIRMED history event are visible.
4. Reload the page or sign out and back in: the order remains. Clearing `relay-v1` does not remove it.
5. Choose **CHILLED** and submit for the same date. It creates a separate order. Repeating an ambient order also creates a new ID; there is no outlet/date merge or upsert. Changing temperature clears the draft to prevent mixing temperature requirements.

The catalogue, stock counts and suggestions remain explicitly marked demo data. Actual order quantities, measurements, outlet, dates, confirmation and tracking are persisted. Draft quantities are memory-only. Store orders never write operational localStorage state, and there is no offline success fallback. Failed submissions show an error and retain the draft. Receipt confirmation is reserved for Stage 7.

## Database and restart proof

Inspect recent application orders with a local SQL client:

```sql
SELECT o."id", o."orderNumber", o."outletId", x."brand", o."deliveryDate",
       o."temperatureRequirement", o."status", o."createdAt", o."createdById"
FROM "Order" o JOIN "Outlet" x ON x."id" = o."outletId"
WHERE o."source" = 'APPLICATION' ORDER BY o."createdAt" DESC;

SELECT i."orderId", i."lineNumber", i."productCode", i."cartons",
       i."unitWeightKg", i."unitVolumeM3", i."temperatureRequirement"
FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId"
WHERE o."source" = 'APPLICATION';

SELECT h.* FROM "OrderStatusEvent" h JOIN "Order" o ON o."id" = h."orderId"
WHERE o."source" = 'APPLICATION' ORDER BY h."occurredAt";
```

Stop and restart the API, then reload Order tracking. Both orders and the PostgreSQL session survive when the session secret stays the same. The automated persistence test closes the HTTP server and Prisma client, starts fresh instances, and compares the retrieved chilled order, items and history with the original response. There is no memory order repository.

## Exact cutoff interpretation

**Next-day orders are accepted strictly before 16:00:00 Asia/Colombo. At exactly 16:00:00 and afterward, tomorrow's queue is closed.**

| Server business time | Tomorrow's order |
| --- | --- |
| 15:59:00 / 15:59:59.999 | Accepted |
| 16:00:00 | HTTP 409 `ORDER_CUTOFF` |
| 16:00:00.001 / later that day | HTTP 409 `ORDER_CUTOFF` |

The server samples its clock after validating the payload, looking up the assigned outlet and checking the persisted calendar row, immediately before creating the order. That admission time determines acceptance; a request validated before cutoff can finish committing afterward. The business day and hour use `Intl.DateTimeFormat` with the explicit IANA zone `Asia/Colombo`. UTC, Los Angeles and Tokyo host-timezone tests produce identical results, including Colombo midnight and year rollover. Browser clocks, client timestamps, machine-local date getters and demo dispatch-release flags cannot override acceptance.

Same-day and past delivery dates return HTTP 400 `INVALID_DELIVERY_DATE`. A later future date remains available after cutoff only when its persisted `CalendarDay.isOperating` flag is true; the server never silently moves a rejected next-day order or inserts it as a normal next-day order. The UI initially suggests the earliest currently open operating date from the shared calendar and keeps any explicitly chosen draft date, allowing the server to reject a draft left open across cutoff. The date is the **requested delivery date**; eventual scheduling belongs to Allocation/Trip/TripStop, and deferrals retain their own next-eligible date.

To demonstrate rejection after 16:00, leave a tomorrow-dated draft open before cutoff and submit it afterward. Alternatively, send tomorrow's date directly with the API below. The review dialog displays the server error and preserves quantities. `node --test tests/orders.test.js` exercises 15:59, exactly 16:00 and after 16:00 deterministically, without changing the workstation clock. Tests and the explicit judge startup configuration reuse the same server-factory clock dependency; no HTTP clock override is exposed.

Dates marked non-operating in the imported `calendar.csv` / PostgreSQL `CalendarDay` data return HTTP 400 `INVALID_DELIVERY_DATE`, including weekday closures. Unlisted dates are also rejected because operating status cannot be verified. These checks run before any order, item or history write; existing past-date and cutoff errors retain precedence. Client flags cannot override the calendar.

If no eligible operating date is loaded, `/context` returns `earliestDeliveryDate: null`; the UI leaves a new draft date blank and explains that calendar coverage is unavailable. Explicit draft dates and quantities are preserved on refresh/rejection. The supplied calendar currently covers **2024-01-01 through 2026-06-28**: real-time ordering outside this range needs an authoritative calendar extension. The explicit judge configuration above and deterministic tests reuse the server clock dependency within coverage, without changing the workstation clock or exposing a clock override over HTTP.

## API contract and scope

All endpoints require a signed-in Store Manager with an outlet assignment:

| Method / path | Response |
| --- | --- |
| `GET /api/orders/context` | Assigned outlet/depot and current server ordering window |
| `POST /api/orders` | HTTP 201 `{order}`, with Location header |
| `GET /api/orders?limit=20&offset=0` | `{orders,total,limit,offset}`, newest first; limit ≤ 100 |
| `GET /api/orders/:id` | `{order}` with items, history, allocation and deferrals |
| `GET /api/orders/:id/history` | `{orderId,status,history,deferrals,allocation}` |

Example body (works with the explicit judge clock above; otherwise select a currently open authoritative operating date):

```json
{
  "deliveryDate": "2025-01-04",
  "temperatureRequirement": "CHILLED",
  "items": [{
    "productCode": "WPF-MILK-1L",
    "description": "Fresh milk cartons",
    "units": 3,
    "unitWeightKg": 13,
    "unitVolumeM3": 0.032
  }]
}
```

`units` means full cartons, stored as `OrderItem.cartons`. Each line records its per-carton measurements; response totals sum quantity × measurement. Measurements are positive, bounded and limited to three decimal places; units are positive integers. The manifest supplies descriptions and measurements because a production SKU catalogue is outside this stage. Temperature is set for the whole order and copied to every line. Brand is obtained from the authoritative Outlet relation. The client cannot set status, actor, timestamps or item temperatures. Zod strict objects reject unknown fields, invalid dates, empty lines and malformed quantities.

Optional `outletId` in create/list requests must match the session user's current assignment, otherwise HTTP 403. Detail and history queries always include the server-derived outlet filter; another outlet's ID returns 404 without disclosing its order. Unauthenticated callers get 401; Dispatcher/Driver/Loader and unassigned Store Managers get 403. Auth reloads the active user and assignment on every request.

Order errors consistently use `{ "error": { "code": "...", "message": "...", "details": [] } }`, with `details` only for payload validation. This also covers malformed JSON, origin/session failures and unexpected server errors. Earlier API error contracts are preserved outside `/api/orders`. Responses are `Cache-Control: no-store`. There are no Store update/delete/status mutation endpoints.

## Status visibility and auditability

Fresh seeded orders demonstrate **Scheduled** (`PLANNED`) with the persisted trip/vehicle and **Deferred** with the saved reason, impact and next-eligible date. Expected arrival appears only when a TripStop provides it; otherwise it says Pending. New orders remain CONFIRMED without an allocation. Refresh status, focus the window, reopen tracking, or wait for the session refresh to fetch current state.

Creation, lines and the initial history event commit atomically. A PostgreSQL trigger appends `OrderStatusEvent` on every actual status change, including changes made by later backend stages. Updating an order without changing status does not erase or replace history. Existing rows receive a clearly labelled migration snapshot at their last-known update timestamp; the migration does not fabricate past transitions. Creation records the authenticated creator; generic later transition events record status/time, while actor/reason information continues to live in the related workflow records such as Deferral. Allocation timestamps and deferral records are returned without destructive replacement.

The final allocation engine is not implemented. Dispatcher and field screens remain prototypes for their later stages. Browser regression tests use explicit fixtures for those existing planning/loading/delivery/receipt simulations rather than treating a new persisted Store order as a browser-local dispatcher order.

## Verification

```powershell
npm run db:validate
npm run build
node --test tests/orders.test.js
npm test
npm run test:db
```

For `npm test`, use the existing separate Chrome debugging profile from README. Browser tests start their own local Vite/API servers with a fixed order clock inside calendar coverage and enable developer controls only for the retained field prototype tests.

The order suite covers valid Fresh ambient/chilled and repeated same-date creation, authentication/role rejection, foreign-outlet create/list/detail/history rejection, payload validation, cutoff boundaries, host timezones, scoped listing, durable history and API restart persistence. Browser coverage includes login, review, server confirmation, temperature separation, reload persistence, visible rejection with draft retention, existing scheduled/deferred states and 360–1440px layouts. Test cleanup removes only records created by each test.

Screenshots generated by the browser suite are local ignored artifacts: `artifacts/stage04-store-1440.png`, `artifacts/stage04-store-360.png`, and `artifacts/stage04-order-rejection.png`.

No commits or pushes are part of this stage.

### Calendar coverage follow-up verification

- Case B: source and PostgreSQL both contain 910 matching dates/operating flags, 2024-01-01 through 2026-06-28. No import correction, generated calendar data, migration or database reset was needed.
- `npm run db:validate` and `npm run build` passed.
- `node --test tests/orders.test.js`: **13 passed**, no failures/skips. Added coverage for configured-date validation, production rejection, Colombo midnight/cutoff, authoritative operating defaults, rejected client clock inputs/HTTP setters, and real server time when unconfigured. The first development run caught an incorrect module import path; it was corrected before the passing runs.
- `npm run test:db`: **5 passed**, no failures/skips, including source preservation and repeatable seed.
- `npm test`: **47 passed, 2 failed, 2 skipped**. The delivery-proof prototype check could not find visible `[data-action="resolved"]` at `tests/browser.test.js:411`; its parent suite also failed and two dependent workflow checks skipped. Store Manager browser checks passed. No field workflow changes were made in this correction.
- The order runs emitted a `pg` concurrent-query deprecation warning. `git diff --check` passed (Git also reported LF-to-CRLF conversion warnings).

### Investigation of the reported delivery browser failure (2026-10-02)

The previously reported failing subtest was `delivery defers exceptions and validates proof; receipt fixture supports later-stage prototype checks`, at `tests/browser.test.js:411`, with `Visible element missing: [data-action="resolved"]`. It was **not reproduced in this investigation**. Classification remains **inconclusive**, not proven unrelated or a demonstrated clock regression. No speculative product or test-harness fix was retained.

- Smallest existing runnable scenario: `node --test tests/browser.test.js` (**17 passed**, no failures/skips). Its delivery subtest depends on earlier login, dispatch and loading stages; filtering those away would not reproduce the original scenario.
- Environment audit: `RELAY_DEMO_ORDER_NOW` was absent from the inherited shell/Node environment and after loading root `.env`. Root/API/web environment-file inspection found no active assignment; Vite's development/test/production environment resolution also returned no assignment. `.env.example` only contains a commented opt-in example. The browser harness creates Vite and the API in the test process, with no spawned `server.js` process. It explicitly injects its existing `orderClock: () => orderNow`; it never calls `configuredOrderClock`.
- Wiring audit: only `server.js` consumes the new configuration. The injected clock reaches Store ordering context and order admission through `app.js`/`routes/orders.js`. Seed selection remains `prisma/demo.js`'s fixed `DEMO_DATE`; auth/session handling, delivery fixture timestamps, route visibility and prototype state do not read that clock. Delivery proof uses local `state`, not an orders API response.
- Flow trace: the test selects a deferred order, clicks `retry-stop`, and expects `fieldResolution` to open a dialog containing `resolved`. Temporary CDP diagnostics showed all three retry buttons opening that dialog. The historical failure establishes that the control was not visible when queried, but does not establish whether the prior click missed or the dialog closed. A scrolling/timing cause remains unproven.
- Baseline comparison: temporarily restored `server.js` to `HEAD` (`8d7f31a`) and disabled the new clock module with an import-time error. The isolated browser run passed **17/17**. Also restored the pre-follow-up order tests for a baseline full-suite run: **50/50 passed**. No disabled-module error occurred. Temporary diagnostics were present in these baseline runs, so timing-sensitive failure reproduction remains a limitation. Baseline command wrappers/logs are local ignored artifacts (`artifacts/clock-baseline.cjs`, `artifacts/clock-baseline-full.cjs`, `artifacts/clock-baseline-browser.log`, `artifacts/clock-baseline-full.log`).
- All temporary source changes and diagnostics were restored. With the follow-up intact and the original browser helper, `npm test` passed **51/51**, with **zero failures and zero skips**; the isolated order suite passed **13/13**. `npm run test:db` passed **5/5**; build, Prisma validation and `git diff --check` passed. The existing `pg` concurrent-query deprecation warning remains.
- This investigation changes documentation only. Calendar authority, fail-closed validation, the exact Colombo cutoff, production rejection of demo configuration and real time when unconfigured remain intact. Passing comparisons do not explain the earlier intermittent failure; it may recur.

### Earlier Stage 4 recorded results

- Stage 4 migration applied to the configured local development PostgreSQL database; Prisma schema validation passed.
- Production frontend build passed.
- `npm test`: **50 passed**, zero failures or skips, including prior foundation/auth/data/browser coverage and the new order suite.
- `npm run test:db`: **5 passed**, including repeatable seeding and existing relation constraints.
- Operating-date regression checks: **12 order tests passed**; browser suite: **17 passed**, including operating defaults, Sunday rejection, cutoff interaction, missing coverage and draft retention. The browser harness uses an isolated ephemeral port and a fixed server clock; no production clock override was added.
- Historical Designathon document validation and `git diff --check` passed.
- No allocation engine or Stage 7 receipt mutation API was added.
