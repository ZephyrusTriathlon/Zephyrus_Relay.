# Stage 7 second-audit verification

## Verified results (2026-10-03)

- `npm.cmd run build`: passed.
- `npm.cmd run db:validate`: schema valid.
- `npm.cmd test`: 110 passed, 0 failed, 0 skipped/cancelled; repeated full run also passed 110/110.
- `npm.cmd run test:db`: two standalone runs passed 5/5 each.
- Completed-walkthrough database subprocess runs: 5/5 each, twice per audit run; completed route/receipt snapshots unchanged.
- Browser/E2E suites: historical regression 17 subtests, original online workflow 6 subtests, second audit 8 subtests, all passed (parent tests are included in the 110 total).
- Three-stop loading 3/2/1, continue to stops 2/3 and return to 1, both mixed-issue resolution orders, delayed replay/new-action distinction, shortfall/overage persistence, Dispatcher page reload and required responsive controls: passed.
- Full order history: CONFIRMED, PLANNED, IN_DELIVERY, DELIVERED, RECEIVED.
- `git diff --check`: passed; only normal Windows LF/CRLF notices. Diff and worktree inspected on branch `stage7`; no commit or push.

## Root causes and corrections

1. Shared-stop resolution considered one allocation's historical exceptions instead of the current aggregate state. `reconcileTripStopState` rereads every allocation's open exceptions and proof after mutation. Either outstanding issue retains DEFERRED; the last resolution restores PENDING (or COMPLETED with all PODs). It never removes history or duplicates physical stops.
2. Immediate state checks did not identify the original logical action after resolution. Operational HTTP POSTs now require UUID `Idempotency-Key`; the client retains that key after uncertain network/server results. Existing `SyncMutation` uniqueness and an atomic PostgreSQL transaction persist request identity and result. Exact replay is a no-op even after later transitions; conflicting key reuse fails; new action IDs allow legitimate new exceptions. All operational mutation types use the same wrapper.
3. Loading-issue validation incorrectly capped observed quantity at expected quantity, and the form mirrored that cap. Observed non-negative integer counts may now exceed expected counts. ISSUE blocks READY and requires resolution/recheck; allocation quantity stays unchanged. Normal load/POD remains exact-match only; Driver mismatch uses delivery exceptions.
4. Database relation tests inserted against a demo allocation and asserted empty global POD/sync tables. They now own fixture orders, allocations, stops, vehicle and (for destructive constraint checks) outlets. Assertions and cleanup are scoped to those IDs. Repeat-seed checks target demo records, while the completed-walkthrough audit separately snapshots application records across both database runs. Planning validation counts are fixture-scoped; other-outlet authorization creates its own order and checks it remains inaccessible after restart. No demo operational state is reset.
5. One-stop and width-only coverage could not establish reverse loading, continue/return or visible Dispatcher refresh. The new three-stop route preserves actual TripStop/Allocation IDs, loads 3/2/1, defers stop 1 while delivering 2/3, returns to 1, and completes receipt/history. Separate browser contexts check real Dispatcher page reloads at RELEASED, LOADING, READY, IN_PROGRESS and COMPLETED. Responsive tests check labels, rendered/enabled controls and existing navigation, with real clicks through the workflow.

Sign-out also now clears the previous account's in-memory field projection immediately. This removes a stale-data race found during full-suite verification. Existing Stage 5/6 planning algorithms and submitted styling are unchanged.

## Exact regression names

In `tests/stage7-audit.test.js`, under `Stage 7 second-audit regressions on persisted operational fixtures`:

- `HTTP role and assignment boundaries protect every online action`
- `Three-stop reverse loading and Loader Designathon controls survive phone/tablet reloads`
- `Quantity mismatch 10/8 and 10/12 persists; 10/10 rechecks normally without changing allocation`
- `Driver 360/390/430 controls continue elsewhere, persist deferral and return to complete`
- `Mixed shared-stop issues reconcile: Store then Driver`
- `Mixed shared-stop issues reconcile: Driver then Store`
- `Durable action IDs suppress delayed replay while allowing a new exception action`
- `Database suite passes twice after a completed walkthrough and preserves unrelated receipts`

The existing `Stage 7 real online lifecycle, authorization, retries and responsive browser` in `tests/operations.test.js` retains all six subtests, including Store-created orders, Stage 6 allocation, transactional POD failure rollback, duplicate POD/receipt, persistent Store dialogs and status history. It now sends action IDs and uses an isolated browser context.

Changed database tests retain their names:

- `independent order IDs allow repeated outlet/date and database constraints reject inconsistent allocations`
- `loading, delivery, receipt and sync records link correctly without leaving test data`
- `development read APIs return bounded data and reject mutations`

Other adjusted regressions:

- `validation uses persisted quantities, vehicles and windows without writes`
- `other outlet IDs cannot access orders or change ownership`
- `orders and session survive closing the API and database client and starting fresh`

Suite-wide searches reviewed `count`, `findFirst`, `deleteMany`, seeded operational IDs and fixed fixture dates. Remaining supplied/demo reference assertions intentionally test imports; operational zero-count assertions and deletes are scoped to owned fixtures. Historical simulation tests remain explicit developer-only coverage, not evidence of online persistence.

## Scope and reproducibility

No Prisma schema changes or migrations. The applied-action ledger reuses existing schema; this is not Stage 8 synchronization. Live connection required; no offline queue/service worker/IndexedDB. Split POD, media/signatures, inventory adjustments and Driver scheduling remain outside Stage 7. Tests use a dedicated seeded development database and Chrome remote debugging. Loader widths: 360/768/1024; Driver: 360/390/430. Screenshots are ignored local artifacts, not pixel-perfect fidelity assertions. Seed judge data and existing operational records are preserved.

Run the commands in the accompanying walkthrough. Node's reported full-suite count includes parent tests; the two nested database subprocess runs each separately report five tests and are not added to the full-suite count. A PostgreSQL adapter deprecation warning about concurrent `client.query` may appear; it is not a failing assertion.
