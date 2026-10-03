# Stage 9 final stabilization report

2026-10-03. Implementation and native verification are complete. **Docker image/Compose execution remains unverified: this machine has neither Docker nor Podman.** Human submission sign-off and a public HTTPS deployment are also pending. No commit or push was made.

## Delivered system

Vite builds the vanilla JavaScript four-role frontend. Express serves it and same-origin APIs; order/planning domain logic and transactional operational services use Prisma/PostgreSQL. Driver offline work uses a public-shell Service Worker plus encrypted Dexie/IndexedDB manifests/outbox; `/api/sync` reuses the operational service, with durable idempotency receipts and visible conflicts.

| Role / capability | Final status |
| --- | --- |
| Store Manager | Server-validated orders and outlet-scoped history; delivered POD inspection and persisted receipt confirmation |
| Dispatcher | Persisted allocation/deferrals, explainable rejection, draft review, weekly reservations and atomic revalidation/release |
| Loader | Released depot-scoped manifests, reverse stop loading, persisted shortfalls/resolution and READY transition |
| Driver | Assigned trips, route start, arrival, exceptions/reattempt, full-count POD and route completion |
| Constraints | Weight, volume, refrigeration, van access, depot, delivery/mall windows, time/trip limits and weekly fuel quota retained |
| Offline | Actual browser network loss, reload, pending arrival/POD, reconnect, reconciliation and account isolation tested |

Fresh clone no longer depends on ignored private CSVs. Public independently generated references provide 120 outlets, 60 vehicles, two depots and 910 calendar days, plus five seeded orders and an assigned historical route. Authorized official-data import remains supported in a separate database. Relative data paths now resolve from repository root even when the API is started through its npm workspace.

Added root multi-stage Node 24 Dockerfile, app/PostgreSQL Compose, `.dockerignore`, migration/seed startup, readiness endpoint and complete environment example. Runtime uses the non-root node user and pruned dependencies; Prisma CLI remains for migrations. Startup failures propagate. No destructive reseed occurs on restart. Local Compose publishes loopback only and explicitly permits local HTTP cookies; HTTPS deployment must enable Secure cookies.

Additional fixes: require JSON for known mutation APIs without changing unknown/development-path 404 behavior; preserve the persisted 04:45 departure when reviewing a seed draft lacking metric snapshots; align OrderStatusEvent's Prisma `onUpdate` annotation with existing SQL; remove prototype wording from live page metadata; serialize regression files to avoid overlapping database writers. No migration history was rewritten.

## Design and documentation

Historical Designathon files and screenshots are unchanged. Compared submitted Store replenishment/tracking/receipt, Dispatcher queue/deferral, Loader manifest and Driver next-stop/offline captures with current built-app screenshots. Typography, green/neutral surfaces, field action hierarchy, dialogs and navigation remain recognizable. Dispatcher day/queue/trip layout and Store status/history cards are material documented refinements, not pixel parity. See [requirements/fidelity/control inventory](final-audit.md).

README now describes the actual final application, exact setup, credentials, configuration, limitations and deployment placeholder. [Architecture](architecture.md), [data model](data-model.md), [AI disclosure](ai-disclosure.md) and the [34-action judge walkthrough](walkthroughs/judge-walkthrough.md) are present. AI disclosure explicitly leaves human final sign-off pending rather than claiming a review that has not occurred.

## Verification results

Node v24.14.1, PostgreSQL 18, separate loopback audit cluster, isolated Chrome CDP browser contexts. Existing developer database and private `.env` were not modified. Regression references used authorized local private data; judge acceptance used only public generated references. Native clean-copy test omitted host node_modules, dist, `.env`, private data, browser state and existing database contents.

| Exact command / context | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| `node --env-file=artifacts/stage9/relay_stage9_regression.env --test --test-concurrency=1 tests/*.test.js` | 129 | 0 | 0 |
| `node --env-file=artifacts/stage9/relay_stage9_regression.env --test tests/database.integration.js` | 5 | 0 | 0 |
| `node --env-file=artifacts/stage9/relay_stage9_judge2.env --test tests/judge.integration.js` with RELAY_JUDGE_TEST=true | 7 | 0 | 0 |
| Clean-copy `node --test tests/judge.integration.js`, explicit dedicated DB/seed/secret/data environment and RELAY_JUDGE_TEST=true | 7 | 0 | 0 |

The 129-check full suite includes unit/domain constraints, planning/release APIs, authentication/RBAC, ordering, Loader/Driver/POD/receipt, browser/responsive, offline/sync/idempotency/conflict and static-security categories. Its Stage 7 audit additionally invokes the database suite twice (5/0/0 each), preserving unrelated completed receipts. Do not add repeated executions to a unique-coverage total.

Current successful evidence: `artifacts/stage9/regression-verified.log`, `database-verified.log`, `judge-final.log`, `clean-judge.log`, `clean-verification-final.log`. These ignored local artifacts are not setup prerequisites; reproduce using the root README and your own test environment. Current captures are under `artifacts/stage9/` and the clean copy's equivalent directory.

| Other check / exact command | Result |
| --- | --- |
| `npm ci` (root and isolated clean copy) | Passed; 281 packages installed, npm reported 0 vulnerabilities |
| `npm run build` with VITE_ENABLE_DEV_TOOLS=false | Passed, including generated SW and Dexie shell asset |
| `npm prune --omit=dev --ignore-scripts --prefix artifacts/stage9/clean` | Passed; Vite absent, bootstrap and acceptance still work |
| `npm run db:validate` | Passed |
| `node --env-file=artifacts/stage9/relay_stage9_judge2.env node_modules/prisma/build/index.js migrate status` | Five migrations applied, up to date |
| Empty DB `prisma migrate deploy` and `prisma/seed.js` | Passed on independently created regression/public databases |
| `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` using judge DB | Only SQL-managed Session table differs; no domain schema drift after annotation fix. Diff was inspected, never applied. |
| `node artifacts/stage9/clean-verify.mjs` | Native startup, pruned runtime, failure propagation, browser acceptance, HTTP security and bundle scan passed |
| Short SESSION_SECRET / unreachable PostgreSQL bootstrap | Both exit 1 without starting an application |
| Seed rerun after completed route and two receipts | Preserves all order states, proofs, receipts and completed trip |
| Responsive default production build | Store, Dispatcher, Loader, Driver at 360/390/430/768/834/1024/1280/1440: no page overflow; existing suites cover focus, dialogs, fixed field actions, toasts and mobile tabs |
| `node tests/validate-designathon-docs.js` | Five historical HTML documents pass print/page/image checks |
| Production bundle scan | No scanned judge password, bcrypt hash, DB URL, env secret assignment, host path, debug API endpoint or source map; legacy fixture code remains disclosed |
| `git diff --check` | Passed, exit 0 |
| Required-file/link/case and lockfile checks | Passed; all current documentation links resolve with exact filename casing; root dependencies match lockfile |
| `docker build .`, `docker compose up`, fresh Docker volume workflow | **Not run: Docker unavailable.** Native tests do not establish Linux image/Compose success. |

Diagnostic runs were not hidden or weakened: initial suite 128/0/0; after adding JSON enforcement, 127/2/0 because unknown development mutations changed from 404 to 415 (fixed by scoping enforcement, assertions retained). Initial judge test 5/2/0 because it did not close the receipt dialog (guide/test corrected). Initial clean-copy acceptance 1/6/0 because its screenshot subdirectory was absent, cascading into later role steps (test now creates its own output directory). All relevant reruns above passed. Initial build attempts exposed a temporary package JSON BOM and missing host Dexie; normalized UTF-8 and lockfile clean installation resolved both. Windows sandbox restrictions required approved PostgreSQL/Chrome startup and npm cache/network access. A pg concurrency deprecation warning remains non-fatal under the pinned pg 8 dependency.

## Security findings and explicit production HTTP checks

Against the native production server started through the same container bootstrap using pruned dependencies:

| Probe | Observed |
| --- | --- |
| `/data/General%20Data/outlets.csv`, `/.git/config`, `/.env`, `/.env.example` | 404 |
| Prisma schema/judge CSV, package.json/lockfile, audit logs, arbitrary source-map/path | 404 |
| Unauthenticated planning mutation | 401 |
| Store/Driver planning release | 403 |
| Different Driver acting on main trip | 404 |
| Loader from another depot loading main trip | 404 |
| Store receipt for OUT005 (other outlet) | 404 |
| Store/Dispatcher/Loader sync | 403 |
| Cross-origin logout mutation | 403 |
| Non-JSON known mutation | 415 |
| Session after normal logout | 401 |

HttpOnly/SameSite=Lax and production HTTPS Secure cookies are covered by auth tests; the loopback-only preview exception is explicit. Safe-user responses exclude hashes. Server role/outlet/depot/assignment checks and replay ownership checks are enforced. The SW caches only public shell resources. Offline tests cover encrypted account isolation, expired authorization, reassignment, lost acknowledgements, duplicate IDs, conflicts and retained pending work. No unresolved material finding was observed within these checks; this is not a claim of penetration-test completeness. Public deployment still requires correct HTTPS/proxy configuration and appropriate credentials.

## Genuine remaining limitations

- Docker/Linux image build and Compose fresh-volume acceptance must be executed on a Docker-capable host before claiming fully verified submission readiness.
- Public HTTPS URL and human team review/sign-off are pending.
- Public judge references are simplified synthetic examples, not official-data equivalence. Official-data regression was separately exercised locally.
- Calendar ends 2026-06-28; current-date ordering needs a later authorized calendar import. The historical seeded walkthrough needs no fake clock.
- Assisted allocation does not administer Driver assignments; the main seeded route is assigned. The extra van-only planning trip deliberately remains outside the Driver walkthrough.
- Offline is Driver-only and needs an online initial login/cache. Unsynced browser data is vulnerable to storage eviction; secret rotation can invalidate pending vault access. Conflicts require operational resolution.
- Stock suggestions/contacts/maps are not integrated operational systems; partial inventory write-offs, split PODs, live traffic and automated optimization are not implemented.
- Classic production scripts retain gated historical fixture code; developer controls remain disabled and cannot authorize server mutations.

## Shortest judge path

1. Copy `.env.example` to `.env`; set independent random SESSION_SECRET (32+ characters) and URL-safe POSTGRES_PASSWORD.
2. Run `docker compose up` from the repository root on a Docker-capable host.
3. Open http://localhost:3001, log in as `store@relay.demo` / `RelayDemo!26`, and follow the [numbered walkthrough](walkthroughs/judge-walkthrough.md) using 2025-01-02.

## Git — implementation-time snapshot

The following diff/status was captured before the Stage 9 implementation was committed as `543f525`. It is historical evidence, not the current worktree status. The earlier submission-readiness verification did not stage, commit or push changes; the subsequent repository closeout was separately authorized to do so.

No files staged, no confidential datasets staged, no commit/push. Historical `docs/designathon/` diff is empty. New public CSVs were generated without reading private data. `git diff --check` exits 0. `git diff --stat` below covers tracked modifications only; untracked additions are listed separately by status.

```text
.env.example                     |  51 +++++++++-----
README.md                        | 129 +++++++++++++++++++---------------
apps/api/src/app.js              |   8 ++-
apps/api/src/auth.js             |   8 ++-
apps/api/src/planning-data.js    |   3 +-
apps/web/index.html              |   2 +-
apps/web/src/scripts/dispatch.js |   6 +-
docs/data-model.md               |  28 +++++---
package-lock.json                | 147 ++-------------------------------------
package.json                     |  38 ++++++++--
prisma/import-network.js         |   3 +-
prisma/schema.prisma             |   2 +-
tests/api.test.js                |   7 ++
13 files changed, 195 insertions(+), 237 deletions(-)
```

```text
 M .env.example
 M README.md
 M apps/api/src/app.js
 M apps/api/src/auth.js
 M apps/api/src/planning-data.js
 M apps/web/index.html
 M apps/web/src/scripts/dispatch.js
 M docs/data-model.md
 M package-lock.json
 M package.json
 M prisma/import-network.js
 M prisma/schema.prisma
 M tests/api.test.js
?? .dockerignore
?? Dockerfile
?? docker-compose.yml
?? docs/ai-disclosure.md
?? docs/architecture.md
?? docs/final-audit.md
?? docs/final-report.md
?? docs/walkthroughs/judge-walkthrough.md
?? prisma/judge-data/
?? scripts/
?? tests/judge.integration.js
```
