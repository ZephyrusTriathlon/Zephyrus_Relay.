# Submission readiness follow-up

This report supersedes the affected limitations in the historical Stage 9/10 reports. Public hosting, the YouTube video, submission and the user's normal local frontend rebuild remain team tasks.

## Implemented changes

- Default native/Docker reference files are exact supplied copies, with a SHA-256 manifest and Git attributes preserving CSV bytes. The import includes all 44 ambient vehicles, 12 mall windows, 486 monsoon dates and 59 payday dates. Seed refuses to change reference values underneath existing operations.
- Explicit `RELAY_JUDGE_MODE=true` uses a configured historical business clock for ordering, including production startup. Defaults are 2025-01-01 15:00 Colombo and the unchanged supplied calendar. A small note beside Store ordering discloses the scenario. Startup requires covered dates and rejects non-demo accounts. `RELAY_JUDGE_MODE=false` retains real-clock behavior. Security/session and delivery event clocks remain real.
- An application-owned server catalogue supplies Store product specifications. Unknown products, altered dimensions/descriptions and temperature mismatches are rejected. Clients may send code and quantity only. Product snapshots remain on orders.
- Frozen goods are supported by catalogue, API, Prisma migration, UI and the same reefer-only constraint as chilled goods.
- Dispatcher can move an unallocated deferred order to a later operating date with a reason and explanation. A version check and shared planning lock prevent competing moves/allocation. Original requested date, deferral records, actor and status history are preserved. The destination order must be allocated and validated again. Lost-acknowledgement order replay compares the original request date.
- Release rejects every draft lacking an active Driver; the UI shows the required action and disables confirmation. Driver availability is not used to shrink the allocation fleet.
- Planning displays payday, festival/ramp, weekend and monsoon context. Monsoon travel minutes, including return legs, receive a conservative 20% allowance. This is an explicit engineering assumption, not a forecast or supplied calibrated coefficient. Actual submitted demand determines capacity. Existing old-policy timing snapshots are recomputed for reservations.
- README contains a numbered four-role walkthrough, new ordering and carry-forward steps; detailed guide, architecture, data model and AI disclosure reflect current behavior.

## Upgrade and review

The packaged references differ from the previous simplified seed. Use a **fresh database/Compose project**, not a reseed/reset of existing operational work. Apply all six migrations, then seed. Existing `.env` files are not replaced automatically: configure judge mode and the supplied reference directory using `.env.example`; remove the incompatible legacy `RELAY_DEMO_ORDER_NOW` when enabling judge mode.

The new Frozen product's packaging is application catalogue data, not a claim that the competition supplied SKU-level specifications. Source CSV values are unchanged. An oversized whole order remains infeasible after carry-forward; moving it is not a capacity bypass. Splitting oversized orders and partial inventory write-offs remain outside this implementation.

Human reviewer names/acceptance are still a team responsibility. Automated work cannot sign off on their behalf.

## Executed verification

All database/browser checks used an isolated QA database, profile and production build under ignored `artifacts/submission-fixes/`. The user's `.env`, operational database and normal `apps/web/dist` were not replaced.

| Check | Result |
| --- | --- |
| Prisma schema validation/client generation | Passed |
| Fresh database: six migrations and exact supplied seed | Passed: 120 outlets, 60 vehicles, 2 depots, 910 calendar days, 5 seeded orders, 1 trip, 4 accounts |
| Production frontend build in isolated output directory | Passed |
| Full serial regression | **141/141 passed**; `regression-accepted.log` |
| Database integration after completed operational workflows | **5/5 passed twice**, within the serial regression |
| Fresh seeded judge walkthrough | **7/7 passed**; `judge-accepted.log` |
| Offline suite using the isolated build's Service Worker | **17/17 passed**; `offline-isolated-build.log` |
| Ordinary production server startup | Passed: readiness, login, frontend, disclosed judge clock and frozen catalogue |
| Responsive judge views | Passed at 320, 360, 375, 390, 412, 430, 768, 834, 1024, 1280 and 1440 px |
| Source diff whitespace check | Passed |

Browser coverage includes a new frozen order through all four roles, loading/delivery issue recovery, real network-offline reload, durable pending POD, reconnection and receipt; deferred carry-forward also passes through the visible Dispatcher dialog. The new API cases cover tampered catalogue fields, date/role/version checks, concurrent moves, original-request replay and missing/inactive Driver release rejection. The complete seeded walkthrough includes the assigned additional van trip and preserves final state on reseed. The Dispatcher screenshot was visually inspected; viewport assertions do not constitute physical-device or full accessibility certification.

Initial QA runs exposed a local HTTP cookie override affecting a default-production-cookie assertion and an incorrectly configured Vite test WebSocket server. The test harness was corrected; application assertions were retained. The existing PostgreSQL driver concurrent-query deprecation warning remains non-fatal and was not suppressed.

Docker is not installed in this environment, so final container startup cannot be certified here. Database bootstrap, server code and production frontend are tested natively; a final fresh Docker rehearsal remains necessary on a machine with Docker.

## Local upgrade steps for the team

1. Stop the previous local server. Create an empty PostgreSQL database, for example `relay_submission`, owned by the same database user. Keep the old database for existing review history.
2. In the existing root `.env`, change only the database name in `DATABASE_URL` to the new database, retaining the correct local connection credentials. Configure:

   ```dotenv
   RELAY_DATA_DIR=prisma/judge-data
   RELAY_ALLOW_SEED=true
   RELAY_JUDGE_MODE=true
   RELAY_JUDGE_ORDER_NOW=2025-01-01T15:00:00+05:30
   ```

   Remove `RELAY_DEMO_ORDER_NOW` if present. Local HTTP can keep `NODE_ENV=development` and `SESSION_COOKIE_SECURE=false`; public HTTPS uses the production settings documented in README.
3. Run these from the repository root in PowerShell:

   ```powershell
   npm.cmd run db:generate
   npm.cmd run db:migrate
   npm.cmd run db:seed
   npm.cmd run db:status
   npm.cmd run db:counts
   npm.cmd run build
   npm.cmd start
   ```

4. Open localhost:3001 and follow the root README walkthrough. The judge banner and Frozen catalogue option confirm the new setup. Use a separate fresh deployment database for judging, because rehearsal completes the seeded route. Commit/push the source changes, including the new migration, catalogue, reference manifest/CSV files and documentation before submission; do not commit ignored QA credentials/artifacts.
