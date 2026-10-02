# Stage 05: explainable planning and assisted allocation

Stage 5 adds a deterministic domain engine and Dispatcher-only planning APIs. Allocations are persisted as **DRAFT** trips with stops and arrival estimates; orders become **PLANNED**. There is no release endpoint or Stage 6 loading workflow. The existing browser Dispatcher/field screens are still a separately labelled historical prototype, not clients of these planning APIs. No Stage 5 rules were implemented in browser scripts.

## Setup

Use Node 24+, the root `.env` database configuration and the original competition datasets under `data/General Data` (or `RELAY_DATA_DIR/General Data`). Run:

```powershell
npm.cmd ci
npm.cmd run db:validate
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
```

Seeding requires `RELAY_ALLOW_SEED=true` outside production. The new migration only adds nullable JSON planning-context columns to `Trip` and `Deferral`. It does not delete, reset or reinterpret existing records. Reference files are private server inputs; deployments need to mount the data directory and must not serve it as static content.

The shared calendar still covers **2024-01-01 through 2026-06-28**. Closed/unlisted planning dates fail with HTTP 400 `INVALID_PLANNING_DATE`. This stage does not extend the calendar or introduce a demo clock. Planning can review historical operating dates such as the seeded **2025-01-02**; it does not create Store orders or bypass Stage 4's future-date and strictly-before-16:00 Asia/Colombo cutoff.

## Central validator

`packages/domain/src/planning.js` exports pure `validateTrip`, `prioritizeOrders` and `allocateOrders` functions. Inputs supply the business date, persisted order/fleet data, shared travel/service records and existing trip reservations. No clock, database or environment reads occur in the engine.

| Hard constraint | Stable violation code |
| --- | --- |
| Sum of item cartons × weight cannot exceed weight capacity | `CAPACITY_WEIGHT` |
| Sum of item cartons × volume cannot exceed volume capacity | `CAPACITY_VOLUME` |
| Chilled requires REEFER; reefer also accepts ambient | `REFRIGERATION_REQUIRED` |
| VAN_ONLY outlet requires VAN | `VAN_ACCESS_REQUIRED` |
| Vehicle and every outlet share the home depot | `DEPOT_MISMATCH` |
| Arrival satisfies both order and supplied outlet windows | `DELIVERY_WINDOW` |
| Arrival also satisfies supplied mall access window | `MALL_WINDOW` |
| All non-cancelled weekly route reservations fit fuel quota | `WEEKLY_FUEL_QUOTA` |
| At most two non-cancelled trips per vehicle/business date | `DAILY_TRIP_LIMIT` |

Capacity equality passes. Weight and volume use integer thousandths for comparisons, and unsupported measurement precision/range fails closed. Windows use Colombo minutes after midnight with inclusive arrival boundaries; early arrivals wait. An empty window intersection fails. Fresh uses each supplied outlet's actual window, including 07:30 closures. Multiple orders at one outlet share one physical stop/service allowance, while satisfying every requested window.

Additional fail-closed codes are `INVALID_PLANNING_INPUT`, `ROUTE_DATA_MISSING`, `PLANNING_CONTEXT_MISSING` and `TRIP_OVERLAP`. Missing efficiency, required mall data, distance, service allowance, or existing-trip reservation data cannot silently become zero. Trips reserve the vehicle through its return to depot. Routes must return within the business date; this is an explicit Relay scheduling policy, not a claimed Task 2B rule.

## Route-distance and timing assumptions

Policy version: **relay-district-v1**. The API reads the original `district_travel.csv` and `service_allowance.csv`; it does not use prototype hardcoded distances or browser fuel counters.

1. Start at the vehicle's home depot. Use the supplied depot-to-district distance/minutes for the first stop.
2. Between distinct outlets in the same district, use that district's supplied inter-stop distance/minutes.
3. Between different districts, explicitly model travel back via the same home depot: previous outbound distance plus next outbound distance, with the corresponding minutes. This is a coarse, conservative routing assumption, not a measured direct inter-district route.
4. Add the last district's depot distance/minutes for the return leg. Fuel is the entire route distance divided by the vehicle's supplied `kmPerLitre`.
5. Add the supplied brand/dock service allowance once per outlet and any window waiting. Initial departure policy is 04:00 Colombo; subsequent trips start no earlier than return from existing trips. Service completion may follow a window's closing time because the constraint applies to **arrival**.

Times are **free-flow estimates**, not live or traffic-adjusted promises. This version does not use `traffic_speed.csv`, `road_conditions.csv`, training data or external routing. Depot travel within an inter-district leg does not unload the remaining cargo; all orders count toward trip capacity throughout validation.

The fuel week is Monday through Sunday of the Colombo delivery date, including a week that spans a year boundary. Count all persisted non-cancelled trips in that week, including future reservations. Completed trips still count; cancelled trips do not. New trips persist their metric snapshot for later reservations. Legacy trips without snapshots derive an estimate from their persisted allocations/departure and the same supplied routing model; missing inputs block that vehicle. These are planned fuel reservations, not measured fuel telemetry.

**Same-brand trips, same-district trips, Fresh's 270-minute Task 2B budget and Style/Tech's 480-minute Task 2B budget are not enforced.** Mixed-brand and mixed-district trips may pass. Tests explicitly cover a feasible mixed route exceeding 480 minutes.

## Priority and candidate scoring

Order priority is lexicographic, descending: number of historical deferrals; days since the outlet's last delivered/received order; chilled; van-only; tighter effective window; Fresh; larger weight; larger volume. Missing last-service history receives a documented policy value of 3650 days. Stable ascending order ID breaks ties. Historical deferrals include resolved attempts, making repeated skipping visible.

For each eligible order, try appending it to each trip created by this run and try a new trip for each vehicle. Existing persisted trips remain fixed reservations; Stage 5 does not edit their manifests. Candidates must pass every hard constraint. Rank feasible candidates by: reuse a trip created in this run; lower incremental fuel; better weight utilization; stable candidate ID. Record priority signals, selected score, explanation and rejected candidates with violation codes. This is an explainable greedy heuristic; it can defer work that another ordering or optimizer could fit.

A final validation pass checks every new trip against all other new and existing reservations before any plan is persisted. Returned decision IDs refer to real persisted draft trips; planning-context snapshots retain the deterministic candidate identifiers for audit.

## API contract

Authenticate as `dispatcher` / `RelayDemo!26` using the existing session login. Requests use same-origin JSON and the session cookie. Store Manager, Driver and Loader accounts cannot access planning endpoints. Clients supply IDs; weights, capacities, outlet restrictions and fuel reservations are always loaded server-side.

| Endpoint | Input / result |
| --- | --- |
| `GET /api/planning/day/2025-01-02` | Orders with deferral history and allocation, vehicles, that day's trips, weekly reservations, policy |
| `POST /api/planning/validate` | `{ "date": "2025-01-02", "vehicleId": "VEH001", "orderIds": ["demo-order-van-only"], "departureMinute": 393 }` → `{ feasible, violations, metrics }`; no writes |
| `POST /api/planning/allocate` | `{ "date": "2025-01-02", "retryDeferred": true }` → persisted draft trips, decisions and deferrals |

`departureMinute` defaults to 240 and is a proposed planning time in Colombo, not an order-admission clock. Validation accepts only unique, unallocated confirmed/deferred orders for the requested date. Allocation accepts only `date` and optional `retryDeferred`; forged capacities, clocks or status fields return HTTP 400 `INVALID_PLANNING_INPUT`. Validation returns HTTP 200 with `feasible:false` for a legitimate but infeasible candidate.

Allocation normally processes only unallocated CONFIRMED orders. `retryDeferred:true` explicitly retries DEFERRED orders on their original requested date. It does not silently move the delivery date. The next eligible date recorded on a deferral comes from a later operating CalendarDay and is advice for reconciliation, not an automatic reschedule. At most 200 pending orders are accepted per run; larger batches fail before writes.

One PostgreSQL transaction persists all trips, stops, allocations, order transitions and deferrals. A shared advisory lock serializes planning writers across all dates, so competing dispatchers cannot overspend weekly fuel or daily trip slots. Default repeat runs do not duplicate allocations or deferrals. Explicit deferred retries append attempts; eventual allocation resolves outstanding deferrals. The existing database trigger records order-status changes. No new loading checks, driver assignments or release transitions are created.

Deferrals store order, existing reason enum, human explanation, impact, actor, timestamp, next eligible date and structured context containing exact codes, candidate rejections, policy, planning date, priority signals and attempt count. Empty fleets produce `NO_VEHICLES` in the explanation/context. Database/reference-data failures return sanitized `PLANNING_UNAVAILABLE`; transaction/uniqueness conflicts return `PLANNING_CONFLICT`.

## Concrete fresh-seed walkthrough

This example uses existing Relay-created demo orders and authoritative supplied fleet/outlet records. It does not modify the competition dataset or seed new transactional examples.

1. Fetch the day **2025-01-02**. The existing demo trip on **VEH001** carries three already-planned orders (390 kg, 0.960 m³). Its derived reservation is 28 km, approximately 5.957 L, departure 04:45 and return 06:33, with window waiting included.
2. Inspect **demo-order-van-only**: OUT001, Fresh, Peliyagoda, ambient, 8 cartons × 13 kg = **104 kg**, volume **0.256 m³**, supplied window **05:00–07:30**, access **VAN_ONLY**.
3. Validate that order against **VEH001** at departure minute 393 (06:33, after its first trip). Capacity fits and reefer accepts ambient, but validation rejects it with **VAN_ACCESS_REQUIRED** because VEH001 is a truck.
4. Allocate the day with `retryDeferred:true`. The fitting order selects **VEH037**, a Peliyagoda ambient van with **1100 kg / 8 m³** capacity, **11.5 km/L** efficiency and **340 L/week** quota. Its 24 km round trip reserves approximately **2.087 L**. Departure is 04:00, wait until arrival at 05:00, service 16 minutes, return at **05:40**. The API creates a DRAFT trip and sets the order to PLANNED.
5. **demo-order-capacity** has **554 cartons × 13 kg = 7202 kg**, exceeding the largest supplied vehicle capacity (**7200 kg**). No priority signal can bypass **CAPACITY_WEIGHT**. Retrying it creates a genuine new persisted deferral with all candidate rejection codes and increments its historical attempt count. Other vehicles may additionally fail volume, depot or access-related checks.
6. Fetch the day again to see the draft, arrival estimate, allocation and appended deferral context. Repeating allocation without retrying deferred orders creates no duplicate work. No plan is released.

The seeded-data regression test independently runs this scenario against the supplied CSVs and verifies VEH037 selection, the rejected truck and the overweight deferral. Running the walkthrough persists changes; the ordinary seed intentionally does not reset existing demo state.

## Verification

```powershell
node --test tests/planning.test.js
node --test tests/planning-api.test.js
node --test tests/orders.test.js
npm.cmd run db:validate
npm.cmd run build
npm.cmd run test:db
npm.cmd test
git diff --check
```

The PostgreSQL API tests require a dedicated development database with fixture date 2024-02-06 free of user orders. They remove only their owned records. Browser tests retain the existing isolated Chrome debugging setup documented in README. The test matrix covers every hard rule, compound violations, exact boundaries, route returns, window waiting/intersections, weekly/year boundaries, cancelled and unknown reservations, priority, deterministic output under shuffled inputs, excess demand, seeded examples, all-role authorization, transaction rollback, concurrent runs, idempotence and persisted retry explanations.

Validated locally with Node 24.21.0 and PostgreSQL 17: full suite **89 passed**, zero failures/skips; database suite **5 passed**; data suite **2 passed**; schema validation, client generation, migration deployment and production build passed. After the final authentication error-code correction, the focused planning API and Store order suites passed **18/18**. `git diff --check` passed. The first sandboxed build was blocked by an esbuild directory-access restriction; the authorized rerun succeeded. PostgreSQL tests emitted the existing client-query deprecation warning. No competition files were changed, and no commits or pushes were made.
