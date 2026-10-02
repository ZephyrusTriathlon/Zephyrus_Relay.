# Stage 07: real online handoffs

PostgreSQL is authoritative from Store ordering through Dispatcher release, Loader checks, Driver POD and Store receipt. Stage 5/6 planning is reused. No migration is required: the existing loading, delivery, exception, POD and receipt models represent this workflow. The Stage 4 database trigger preserves exactly one OrderStatusEvent for each status change.

## Prerequisites

Use Node 24+, PostgreSQL, the supplied network files and the root `.env` described in Stage 02. Point automated tests at a dedicated development database. Run:

```powershell
npm.cmd ci
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
```

Seeding requires `RELAY_ALLOW_SEED=true`, is non-production only, and preserves existing operational records. Keep `VITE_ENABLE_DEV_TOOLS=false` (the default). Open http://localhost:4173. All handoffs below use **Account → Sign out**, then the normal login form. No quick login or role switch is provided.

| Workspace | Email | Seed password |
| --- | --- | --- |
| Store | `store@relay.demo` | `RelayDemo!26` |
| Dispatcher | `dispatcher@relay.demo` | `RelayDemo!26` |
| Loader | `loader@relay.demo` | `RelayDemo!26` |
| Driver | `driver@relay.demo` | `RelayDemo!26` |

These are development seed credentials; repeat seeding does not reset a changed password.

## Exact seeded scenario

Business date: **2025-01-02**. Trip ID: `demo-trip-01`; trip number: `DEMO-2025-01-02-01`; vehicle: **VEH001**; depot: **Peliyagoda**. The seeded `Trip.driverId` is `demo-user-driver` (verified against the database). The Loader is assigned to `depot-peliyagoda`. The Store account is assigned to **OUT004**.

| Physical stop | Order ID / order number | Allocation | Cartons |
| --- | --- | --- | --- |
| 1, OUT004 | `demo-order-chilled` / `DEMO-2025-01-02-CHILLED` | `demo-allocation-chilled` | 12 |
| 1, OUT004 | `demo-order-ambient` / `DEMO-2025-01-02-AMBIENT` | `demo-allocation-ambient` | 8 |
| 2, OUT005 | `demo-order-second-stop` / `DEMO-2025-01-02-SECOND-STOP` | `demo-allocation-second-stop` | 10 |

There are **two physical stops and three allocations**, not three stops. Arrival is recorded once per physical stop, while loading and POD are recorded for each allocation. Departure is initially 04:45 Colombo time; use the persisted value if the Dispatcher previously adjusted the draft. Stage 6 release computes and persists expected arrival times.

## Judge walkthrough

1. **Store:** Sign in as Store, open **Order tracking**, and inspect the two OUT004 orders above. On a fresh seed they are PLANNED. Tracking shows the planned vehicle/trip and, after release, expected arrival. Use pagination if newer orders precede them. The existing seeded orders are sufficient for this walkthrough; creating another order is optional.
2. **Dispatcher:** Sign out, sign in as Dispatcher. Enter **2025-01-02** under **Business date (Colombo)** and **Load day**. Inspect the saved draft `DEMO-2025-01-02-01`. Use Stage 6 **Revalidate & release all drafts**. The trip becomes RELEASED; its IDs, allocations and two physical stops are preserved. Orders remain PLANNED under the existing Stage 6 semantics. **Allocate day as drafts** is available for the remaining queue; any additional unassigned trips will not appear to the Driver. Do not assign those trips merely to make them visible.
3. **Loader:** Sign out and sign in as Loader. Choose `DEMO-2025-01-02-01` in the trip selector. The Warehouse layout shows **Every carton. In the right order.**, real vehicle/departure, reverse physical stop sequence and item checklists. Load OUT005 first, followed by the OUT004 allocations. **Confirm loaded** records the expected carton count. The first valid check or issue moves RELEASED → LOADING.
4. **Optional loading issue:** On the next allocation choose **Report an issue**, select **Missing cartons**, **Damaged goods**, or **Quantity mismatch**, enter **Cartons checked** and details, then save. Reload: the count and OPEN issue persist. The allocation is not loaded and **Complete loading** is blocked. **Resolve issue** requires a resolution note and returns the check to PENDING; **Confirm loaded** then performs the recheck. No allocation quantities, vehicle or stop sequence are altered.
5. **Complete loading:** After all three allocations are loaded and all loading issues resolved, click **Complete loading**. The server changes LOADING → READY atomically. Reload to confirm **Vehicle ready. Team in sync.**
6. **Driver:** Sign out, sign in as Driver, and choose the same trip. Only trips actually assigned to this account appear. **Start route** is available after READY. Click it while safely stopped: the trip becomes IN_PROGRESS and its orders become IN_DELIVERY with status history. Store tracking and a reloaded Dispatcher day reflect this state.
7. **Arrival and POD:** At OUT004 choose **I've arrived**. Both OUT004 allocations share that arrival. Choose **Verify & confirm delivery**, count cartons with the recipient, check verification, enter the recipient and delivery time (Colombo), and **Confirm delivery**. Repeat verification for the second allocation at the same stop; this does not create a second physical stop or arrival. OUT004 becomes COMPLETED only after both PODs. At OUT005 repeat arrival and verification for its 10 cartons. All successful PODs save the authenticated Driver, recipient, quantity, verified flag, reported delivery time and server recording time.
8. **Optional delivery exception:** Before confirming a delivery, **Report a delivery issue** offers Store closed, Recipient unavailable, Damaged goods, Partial delivery, Delivery refused and Access delayed. Save details. The stop remains DEFERRED/outstanding and no successful POD is created. Continue to another available physical stop. **Retry stop** requires a resolution note, records a REATTEMPTED event, and returns the stop to PENDING. Arrive again and verify the full expected quantity. A mismatch must use the exception flow; it cannot silently complete a delivery. Partial deliveries remain outstanding until fully reconciled; split PODs and inventory write-offs are not implemented.
9. **Route completion:** The final successful POD atomically completes the trip only when every allocation has a POD and no delivery exception remains open. The mobile view shows **A good run. Every store replenished.** Reload retains receipts and COMPLETED state. If a Store reported a receipt discrepancy before the remaining deliveries finished, the trip remains IN_PROGRESS. After the Store resolves it, the Driver uses **Complete route**. This action applies the same outstanding-delivery checks.
10. **Store receipt:** Sign out and sign in as Store. Under **Order tracking**, OUT004 orders now show DELIVERED, recipient, time and carton count. **View receipt → Confirm receipt** saves a unique ReceiptConfirmation associated with this Store Manager, POD and outlet, then changes that order to RECEIVED with history. Confirm each OUT004 order separately. OUT005 is outside this Store account's scope and must not be confirmable here.
11. **Optional Store discrepancy:** Before confirming, **View receipt → Report an issue** records damaged goods or a quantity mismatch, with details, in DeliveryException. Its association with an existing POD and reporting Store Manager distinguishes receipt reconciliation from a Driver exception. The order remains DELIVERED. Reload retains the discrepancy; the Dispatcher sees it after **Load day**. After investigation, enter a resolution and **Resolve issue**, then **Confirm receipt**. Receipt issues reported after delivery do not reverse a physically completed trip.
12. **Dispatcher:** Sign out, sign in as Dispatcher, **Load day** again. Inspect COMPLETED, stop states, loading check states, POD/Received labels, and issue details/resolutions. This comes from PostgreSQL, not a browser copy of field progress.

## Optional historical order creation

The supplied calendar ends on 2026-06-28. Real-clock order creation therefore needs a later imported calendar, or an explicitly non-production historical clock. To demonstrate creation against the seeded date, stop the API and start it in a development shell with:

```powershell
$env:RELAY_DEMO_ORDER_NOW='2025-01-01T10:00:00+05:30'
npm.cmd run dev:api
```

This override affects order eligibility only, not field event timestamps. It is rejected in production. Newly created orders have new IDs and require normal Stage 6 allocation/release. Assisted allocation does not assign a Driver; the seeded trip is the documented assigned judge route. Remove the override with `Remove-Item Env:RELAY_DEMO_ORDER_NOW` and restart the API afterward.

## Database verification

Run read-only queries in a PostgreSQL client connected to the same database:

```sql
SELECT id, "tripNumber", status, "vehicleId", "driverId", "plannedDepartureAt",
       "startedAt", "completedAt"
FROM "Trip" WHERE id = 'demo-trip-01';

SELECT s.id AS stop, s.position, s."outletId", s.status AS stop_status,
       s."expectedAt", s."arrivedAt", a.id AS allocation, o."orderNumber",
       o.status AS order_status, lc.status AS loading_status, lc."loadedCartons"
FROM "TripStop" s JOIN "Allocation" a ON a."tripStopId" = s.id
JOIN "Order" o ON o.id = a."orderId"
LEFT JOIN "LoadingCheck" lc ON lc."allocationId" = a.id
WHERE s."tripId" = 'demo-trip-01' ORDER BY s.position, o."orderNumber";

SELECT p.*, r."confirmedById", r."receivedCartons", r."confirmedAt"
FROM "ProofOfDelivery" p JOIN "Allocation" a ON a.id = p."allocationId"
LEFT JOIN "ReceiptConfirmation" r ON r."proofId" = p.id
WHERE a."tripId" = 'demo-trip-01';

SELECT 'loading' AS context, i."allocationId", i.type::text, i.status::text,
       i.details, i.resolution, i."reportedById", i."reportedAt", i."resolvedAt"
FROM "LoadingIssue" i JOIN "Allocation" a ON a.id = i."allocationId"
WHERE a."tripId" = 'demo-trip-01'
UNION ALL
SELECT 'delivery or receipt', e."allocationId", e.type::text, e.status::text,
       e.details, e.resolution, e."reportedById", e."reportedAt", e."resolvedAt"
FROM "DeliveryException" e JOIN "Allocation" a ON a.id = e."allocationId"
WHERE a."tripId" = 'demo-trip-01';

SELECT e.* FROM "DeliveryEvent" e JOIN "Allocation" a ON a.id=e."allocationId"
WHERE a."tripId"='demo-trip-01' ORDER BY e."recordedAt";
SELECT * FROM "OrderStatusEvent"
WHERE "orderId" IN ('demo-order-chilled','demo-order-ambient','demo-order-second-stop')
ORDER BY "orderId", "occurredAt";
```

## Repeat without resetting records

Do not reset the seeded trip, delete PODs, reverse order statuses or rerun demo writes to replay the walkthrough. Inspect existing completed Driver receipts, Store receipts and Dispatcher status. READY remains visible to Loader; IN_PROGRESS/COMPLETED trips leave its active loading list. Repeated identical confirmations are idempotent, not new records. Use a fresh dedicated development database for a fresh seeded manual demonstration.

For repeatable automation, `tests/operations.test.js` creates orders through the Store API on the otherwise unused fixture date **2024-04-09**, allocates/releases through Stage 6, assigns only its newly created fixture trip to the seeded Driver, and cleans up only its own IDs. It refuses to overwrite existing work on that fixture date. It uses an isolated browser context to separate cookies from concurrent suites.

`tests/stage7-audit.test.js` additionally creates a three-physical-stop route (OUT004, OUT005, OUT011), private fixture vehicle, and unique operational IDs on an unused operating date in September 2024. It releases through Stage 6, drives the real Loader/Driver UI, checks Dispatcher statuses after actual page reloads, completes Store receipt, and then runs the database integration suite twice while that completed route remains present. Snapshot comparisons verify that those runs preserve its POD, receipt, exceptions and history. Shared-stop and delayed-replay fixtures are independent; cleanup deletes only owned records. See [second-audit verification](stage-07-second-audit.md) for exact test names.

Start a separate headless Chrome with `--remote-debugging-port=9222` and a dedicated user-data directory (or set `RELAY_CDP_URL` to an existing test browser), then run:

```powershell
npm.cmd run build
npm.cmd run db:validate
npm.cmd test
npm.cmd run test:db
git diff --check
```

Browser screenshots are saved under ignored `artifacts/stage07-*.png`. Loader widths: 360/768/1024; Driver widths: 360/390/430. Historical Stage 1–6 simulation assertions remain intact and explicitly opt into developer-only regression mode. The new suite uses the default built online UI.

## API contract and limitations

All endpoints require an authenticated session, same-origin JSON mutations, role checks and database-derived scope. Every operational POST also requires a UUID `Idempotency-Key`. Reuse that identifier and payload when retrying the same logical action; use a new identifier for a genuinely new action. The existing PostgreSQL `SyncMutation` table stores the applied action and response atomically with domain writes under the `stage7-online` namespace. Delayed exact replays return the original result without changing advanced state; reusing a key for another actor/action/payload is rejected. No schema migration is needed. The UI retains an uncertain request's identifier in memory for retries, not in an offline queue.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/operations/trips` | Loader depot or authenticated Driver assignment; real manifests |
| `POST /api/operations/trips/:tripId/:action` | `complete-loading`, `start`, `complete` |
| `POST /api/operations/trips/:tripId/allocations/:allocationId/:action` | `load`, `loading-issue`, `resolve`, `arrive`, `exception`, `pod`, `receipt`, `receipt-issue`, `resolve-receipt` |

The existing `/api/orders` and `/api/planning/day/:date` reads now include downstream persisted facts. All execution business logic lives in `apps/api/src/operations.js` for reuse by Stage 8. One transaction advisory lock serializes operational writes and retries; this is intentionally conservative for the current workload. POD and receipt uniqueness also have existing database constraints.

Shared-stop reconciliation reads active issues and PODs across all attached allocations. Resolving just one issue cannot unblock a still-deferred stop; resolving the last issue makes it actionable again, or completed if every allocation has POD. Historical issues/events remain intact. Loader quantity issues accept both shortfalls and overages (non-negative integers), retain the observed count and leave expected allocation quantities unchanged. Normal load/POD still require an exact quantity match.

This stage requires a live connection. It has no service worker, IndexedDB, offline queue or synchronization claim. Images/signatures, a Driver scheduling subsystem, split PODs and inventory adjustments are outside this stage. The route schematic remains explicitly illustrative; supplied data provides outlet/district identifiers, not authoritative street addresses or phone numbers. Field lists currently return the latest 100 eligible trips. Receipt discrepancies reuse existing exception semantics; no schema migration or new media infrastructure was introduced.
