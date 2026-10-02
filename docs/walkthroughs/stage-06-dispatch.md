# Stage 06: Dispatcher planning, review and release

The default Dispatcher screen reads `/api/planning/day/:date`. Assisted allocation uses the Stage 5 engine and persists drafts, stops, allocations and deferrals. No browser capacity, time, fuel or access rule decides feasibility. Historical R-07 controls are only accessible when `VITE_ENABLE_DEV_TOOLS=true`; those fixtures remain separate for later field-stage regression coverage.

## Setup and login

Use Node 24+, the root `.env` pointing to a dedicated PostgreSQL development database, and the supplied private files in `data/General Data`. Follow Stage 02 for database provisioning. Run from the repository root:

```powershell
npm.cmd ci
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
```

Seeding requires `RELAY_ALLOW_SEED=true` outside production. It is not a reset: existing operational records are preserved. Open http://localhost:4173/#dispatch and log in as **dispatcher** with **RelayDemo!26**. Other roles receive 403 from every planning endpoint; unauthenticated requests receive 401.

## Judge steps

1. In **Business date (Colombo)** enter **2025-01-02**, then **Load day**. The supplied calendar ends on 2026-06-28, so use this historical operating date for the seeded demonstration. No clock override is needed for planning. Store order creation still follows Stage 4 rules.
2. Inspect the queue: order status, temperature, access restrictions, requested/outlet/mall windows, allocation, and deferral history. Search by order number, outlet or status. Inspect **Fleet availability** for vehicle capabilities, capacities, depot and persisted weekly reservations. Unknown reservations are displayed as unknown; the server decides whether a candidate is safe.
3. On a fresh seed, select the unallocated van-only order `demo-order-van-only`, choose truck **VEH001**, set departure to **393**, and click **Validate selected candidate**. The server explains `VAN_ACCESS_REQUIRED`. Candidate validation is read-only.
4. Enable **Retry deferred orders on this date** and click **Allocate day as drafts**. The fresh-seed van-only order fits **VEH037**. The oversized `demo-order-capacity` cannot fit the supplied fleet. Results contain real draft IDs and explanations. Expand **Allocation explanation** on a saved trip to inspect rejected candidates and server violation codes. Capacity usage, fuel, departure and return come from server metrics. Stop timestamps are ISO timestamps; departure/return numbers are Colombo minutes after midnight.
5. Review the oversized order's **CAPACITY_WEIGHT** explanation, historical attempt count, impact, timestamp, resolution state and next eligible date. The next date is advice, not automatic rescheduling. Ordinary repeated allocation does not duplicate deferrals; explicitly retrying deferred orders appends an attempt. Reloading the day retains this history.
6. Click **Review / adjust draft** on the new van trip. Select **VEH001** and **Validate & save adjustment**: the invalid change is rejected and the saved manifest remains unchanged. Restore **VEH037**, change departure from **240** to **241**, and save. The server accepts this feasible adjustment. **Move earlier/later** changes the proposed delivery order; saving revalidates the entire manifest. Orders at the same outlet share a physical stop. Stale drafts require a reload before another edit.
7. Click **Revalidate & release all drafts**. The API reloads persisted orders, fleet and route inputs, recalculates every draft and checks them against one another and existing reservations. Successful drafts become **RELEASED** together. A failed validation displays its reason and releases none. Reload the day to verify the status. Repeating release creates no duplicate trips, stops or allocations.
8. Inspect the database using the queries below. Released manifests are now available as real database records for later Loader/Driver stages. The current field screens are still historical prototypes; they are not evidence of database release.

The seeded existing draft is also included in day release and revalidated. If this walkthrough was already performed, inspect existing RELEASED trips and deferrals rather than expecting another allocation of the same order. Do not reset user data to replay it. The automated tests create and clean up their own fixtures.

## Verify database records

Run in a PostgreSQL client connected to the same database:

```sql
SELECT id, "tripNumber", "vehicleId", sequence, status,
       "plannedDepartureAt", "planningContext"->'metrics' AS metrics,
       "planningContext"->'review' AS review,
       "planningContext"->'release' AS release
FROM "Trip" WHERE "deliveryDate" = DATE '2025-01-02'
ORDER BY "vehicleId", sequence;

SELECT t.status, t."tripNumber", s.position, s."outletId", s."expectedAt",
       a.id AS "allocationId", o."orderNumber", o.status AS "orderStatus"
FROM "Trip" t JOIN "TripStop" s ON s."tripId" = t.id
JOIN "Allocation" a ON a."tripStopId" = s.id AND a."tripId" = t.id
JOIN "Order" o ON o.id = a."orderId"
WHERE t."deliveryDate" = DATE '2025-01-02'
ORDER BY t."tripNumber", s.position, o."orderNumber";

SELECT "orderId", reason, explanation, impact, "deferredAt",
       "nextEligibleDate", "resolvedAt", "planningContext"
FROM "Deferral" WHERE "orderId" = 'demo-order-capacity'
ORDER BY "deferredAt";
```

Expect RELEASED trips with ordered stops, matching outlet/order allocations, server-derived arrival times and an actor/timestamp release audit. Orders remain PLANNED until a later execution stage changes their lifecycle. Allocation identities survive review and release.

## API and transaction behavior

All endpoints require Dispatcher session authentication and same-origin JSON mutations.

| Endpoint | Contract |
| --- | --- |
| `GET /api/planning/day/:date` | Persisted queue, deferrals, fleet, trips, reservations and policy |
| `POST /api/planning/validate` | Stage 5 read-only unallocated candidate validation |
| `POST /api/planning/allocate` | `{date, retryDeferred}`; saves draft plans and deferrals |
| `POST /api/planning/edit` | `{date, tripId, version, vehicleId, departureMinute, orderIds}`; `version` is the trip's ISO `updatedAt`, and ordered IDs must retain the manifest exactly once |
| `POST /api/planning/release` | `{date}`; atomically finalizes all drafts on that day |

An infeasible edit returns HTTP 200 with `accepted:false`, `feasible:false` and violations, without writes. A stale or non-draft edit returns 409. Invalid release returns 409 with `released:false` and per-trip violations. Malformed input returns 400. All planning writes use the same PostgreSQL advisory transaction lock as allocation. Release rechecks current quantities and fleet data rather than trusting the saved validation snapshot. Review supports vehicle, departure and stop-order adjustments; moving orders between manifests and cancellation are outside this stage. No schema migration is needed: Stage 5 already created the persistence structure and the schema already defines RELEASED.

## Regression verification

Start the isolated Chrome debugging browser documented in README, then run these commands sequentially. The database suite compares snapshots across reseeding and must not run alongside tests that create orders:

```powershell
npm.cmd run build
npm.cmd run db:validate
npm.cmd test
npm.cmd run test:db
git diff --check
```

Tests cover Dispatcher-only access, queue loading, assisted allocation, persisted/retried deferrals, invalid and valid edits, optimistic concurrency, blocked release after persisted quantities change, release success/idempotence, and correct released stops and allocations. Browser coverage exercises default API planning, server explanations, edits and release, while explicitly selecting the developer simulation for historical field tests.

Verification: full regression suite **94 passed, zero failed/skipped**; database integration suite **5 passed**; subsequent browser verification **18 passed**. Production build, Prisma schema validation and `git diff --check` passed. Browser screenshots are saved in ignored `artifacts/stage06-released-plan.png` and `artifacts/stage06-dispatch-360.png`. The existing PostgreSQL client-query deprecation warning remains. No commits or pushes were made.
