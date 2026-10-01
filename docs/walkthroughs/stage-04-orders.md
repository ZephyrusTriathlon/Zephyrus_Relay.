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

To demonstrate rejection after 16:00, leave a tomorrow-dated draft open before cutoff and submit it afterward. Alternatively, send tomorrow's date directly with the API below. The review dialog displays the server error and preserves quantities. `node --test tests/orders.test.js` exercises 15:59, exactly 16:00 and after 16:00 deterministically, without changing the workstation clock. The injected clock exists only in the server factory used by tests; no HTTP clock override is exposed.

Dates marked non-operating in the imported `calendar.csv` / PostgreSQL `CalendarDay` data return HTTP 400 `INVALID_DELIVERY_DATE`, including weekday closures. Unlisted dates are also rejected because operating status cannot be verified. These checks run before any order, item or history write; existing past-date and cutoff errors retain precedence. Client flags cannot override the calendar.

If no eligible operating date is loaded, `/context` returns `earliestDeliveryDate: null`; the UI leaves a new draft date blank and explains that calendar coverage is unavailable. Explicit draft dates and quantities are preserved on refresh/rejection. The supplied calendar currently covers **2024-01-01 through 2026-06-28**: demonstrations outside this range need an authoritative calendar extension, not a weekday fallback. Tests use fixed clocks within coverage, without changing the workstation clock or exposing a clock override over HTTP.

## API contract and scope

All endpoints require a signed-in Store Manager with an outlet assignment:

| Method / path | Response |
| --- | --- |
| `GET /api/orders/context` | Assigned outlet/depot and current server ordering window |
| `POST /api/orders` | HTTP 201 `{order}`, with Location header |
| `GET /api/orders?limit=20&offset=0` | `{orders,total,limit,offset}`, newest first; limit ≤ 100 |
| `GET /api/orders/:id` | `{order}` with items, history, allocation and deferrals |
| `GET /api/orders/:id/history` | `{orderId,status,history,deferrals,allocation}` |

Example body (replace the historical sample date with a currently open operating date):

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

### Recorded results

- Stage 4 migration applied to the configured local development PostgreSQL database; Prisma schema validation passed.
- Production frontend build passed.
- `npm test`: **50 passed**, zero failures or skips, including prior foundation/auth/data/browser coverage and the new order suite.
- `npm run test:db`: **5 passed**, including repeatable seeding and existing relation constraints.
- Operating-date regression checks: **12 order tests passed**; browser suite: **17 passed**, including operating defaults, Sunday rejection, cutoff interaction, missing coverage and draft retention. The browser harness uses an isolated ephemeral port and a fixed server clock; no production clock override was added.
- Historical Designathon document validation and `git diff --check` passed.
- No allocation engine or Stage 7 receipt mutation API was added.
