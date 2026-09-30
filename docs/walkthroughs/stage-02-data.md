# Stage 02: PostgreSQL, domain schema and private dataset ingestion

Stage 2 adds an 18-model PostgreSQL schema, two migration files, validated CSV ingestion, a repeatable demonstration seed and opt-in development read APIs. It preserves the existing Relay UI and localStorage workflows. Authentication, RBAC, allocation, mutation endpoints and real offline synchronization remain later work.

## Install and database setup

Use Node 24+, npm and a local PostgreSQL installation (validated with PostgreSQL 18.3). From the repository root:

```powershell
npm ci
Copy-Item .env.example .env
```

Do not overwrite an existing `.env`. Provision a **dedicated development database** and put its connection string in root `.env`. The example contains no real credentials. Use a separate database/user from any production system. `createdb -h 127.0.0.1 -U YOUR_LOCAL_ADMIN relay_dev` is suitable when a local PostgreSQL service and role already exist; the administrator provisions the role/password separately. For a self-contained local cluster, see the validation setup below.

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | PostgreSQL URL used by Prisma and the API; required for database operations |
| `RELAY_ALLOW_SEED` | Must be `true` to seed; rejected under `NODE_ENV=production` |
| `RELAY_DEV_READS` | Defaults to `false`; explicit opt-in for loopback-only read endpoints |
| `RELAY_DATA_DIR` | Optional path to a directory containing `General Data/`; defaults to ignored repository `data/` |
| `HOST`, `PORT` | API bind address/port; retain loopback defaults for development |

Prisma config explicitly loads root `.env`; API npm scripts load root `.env` followed by optional `apps/api/.env`. Process environment takes precedence; the API-specific file overrides root file entries otherwise. Keep `DATABASE_URL` in the root file so seed/migrations/API agree. Vite does not need or receive database credentials. Never prefix secrets with `VITE_`.

`npm ci` runs Prisma client generation. `prisma.config.mjs` keeps schema, migrations, seed command and datasource configuration in JavaScript. Prisma 7.10 uses the supported `prisma-client-js` generator to preserve the JavaScript application; this generator is in maintenance mode and should be reviewed during a future Prisma major upgrade. The PostgreSQL driver adapter has a bounded pool and connection timeout. See [Prisma's generator documentation](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators).

The lockfile includes patched `csv-parse` 7 and targeted `deepmerge-ts` / `mysql2` overrides for Prisma tooling. Installation, generation, migration and integration checks were rerun after those overrides; npm reported zero vulnerabilities. Reassess the overrides when upgrading Prisma.

## Migrations and seed

Set `RELAY_ALLOW_SEED=true` in your local environment, then:

```powershell
npm run db:validate
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:counts
npm run db:status
```

`db:migrate` uses `prisma migrate deploy`: it applies reviewed migrations without resetting the database or requiring a shadow database. `db:migrate:dev` is only for authoring future migrations against an isolated development database. The first migration creates tables/enums/indexes/foreign keys; the second adds scalar SQL checks that Prisma schema syntax cannot express. Never replace these checks with a bare `db push` setup.

The importer reads only:

- `data/General Data/outlets.csv`
- `data/General Data/vehicles.csv`
- `data/General Data/calendar.csv`

The proper CSV parser supports quoted fields and BOMs. Headers, primary keys, enums, capacities, times, row counts, depot agreement and calendar date metadata are validated before any write. Unknown columns, missing/duplicate IDs and malformed data fail the seed. Errors identify file/row/field without dumping raw values. Supplied business flags are preserved; notably the supplied calendar marks Sunday, not Saturday, as weekend.

One transaction and an advisory lock protect the import/demo seed. Supplied records are upserted by their stable IDs (calendar by date); demo records have stable namespaced IDs and are created only when absent. Re-running the seed does not reset existing demo order/trip progression or create duplicates. Conflicting non-supplied IDs or unexpected extra supplied records fail and roll back; the seed never deletes records to force counts. Re-seeding can refresh official reference fields from the CSVs, so it is a development operation rather than a general production data maintenance tool.

Expected counts for the supplied files:

| Records | Count |
| --- | ---: |
| Supplied outlets | 120 |
| Supplied vehicles | 60 |
| Supplied depots | 2 |
| Supplied calendar days | 910 |
| Relay demo users | 4 |
| Relay demo orders | 5 |
| Relay demo trips | 1 |
| Demo stops / allocations / pending loading checks / deferrals | 2 / 3 / 3 / 1 |

The demonstration day is **2025-01-02**, verified as operating in the supplied calendar. Entities are selected deterministically from supplied records. Demo products, quantities, user identities and transactional records are explicitly Relay-created, not official competition transactions. Cases include chilled and ambient cartons, repeated Fresh orders on one date, two planned delivery stops, a van-only outlet left unallocated and an order heavier than every supplied vehicle recorded as deferred. This is a draft demonstration plan, not allocator output or a claim that all route constraints have been optimized.

## Read APIs and confidentiality

For development inspection only:

```powershell
$env:RELAY_DEV_READS='true'
npm run dev
```

Vite is at http://localhost:4173; Express is at http://localhost:3001. The proxy supports the same API routes:

| Endpoint | Response |
| --- | --- |
| `/api/health` | Unchanged liveness response; intentionally does not claim database readiness |
| `/api/outlets?limit=25&offset=0` | Selected outlet fields plus total and pagination |
| `/api/vehicles?limit=25&offset=0` | Selected constraints/fuel fields plus total and pagination |
| `/api/demo-day` | Bounded demo-order/trip summaries labelled `DEMO` |

Network pages allow limits 1–50 and offsets 0–10000; unknown/invalid query parameters return 400. Decimal values serialize as strings to retain precision. Reads return 404 unless explicitly enabled and requested over loopback. Startup rejects enabling them in production, and middleware also denies them under production configuration. Responses use `Cache-Control: no-store`; unavailable databases return sanitized 503 responses. There are no mutation endpoints, user-list endpoints or raw CSV endpoints. These reads intentionally disclose selected network data to the local developer; do not publish them behind a public tunnel or proxy. Stage 3 must introduce authorization before broader access.

`data/`, `.env` and ignored database artifacts remain private. Neither source CSVs nor derived raw tables are included in commits, frontend assets, walkthroughs or build output. Source files are never renamed or modified by ingestion. Existing static allowlists reject CSV downloads, `.git`, `.env`, Prisma schema/config/migrations/seed and API source in both Vite and Express.

## Tests and safe inspection/reset

```powershell
npm run build
npm run test:data
npm run test:foundation
npm run test:db
```

`test:db` explicitly requires `DATABASE_URL` and `RELAY_ALLOW_SEED=true` pointing to a **dedicated development/test database**. It seeds twice and validates connection, actual source-row values, capacities/temperature/type/fuel, windows/parking/depot relationships, duplicate prevention, order identity, SQL constraints and local APIs. It never resets the database. `test:data` covers safe CSV parsing and enum agreement without requiring confidential files or PostgreSQL. Foundation HTTP tests do not need a live database.

For the existing browser regression suite, leave `npm run dev` running, start Chrome as described in the README (a separate profile, debugging port 9222), then run `npm test`. Use `$env:RELAY_URL='http://127.0.0.1:3001'` to test the built frontend served by Express. No frontend API integration or storage migration is included in this stage.

`npm run db:counts` shows aggregate counts without printing raw tables or credentials. `npm run db:status` checks migration state. Inspect the schema through `docs/data-model.md` rather than exporting network tables. If using `psql`, avoid putting a credential-bearing URL in shell history or output.

Re-running `db:seed` preserves demo progress. To reset, first verify the database name/host is a disposable local development database and save any needed work. Prefer provisioning a fresh database and updating the local `DATABASE_URL`, then applying migrations and seed. If a destructive reset is specifically intended, `npx prisma migrate reset` prompts before deleting the selected schema; afterward run `npm run db:seed` explicitly (Prisma 7 does not automatically seed). Never reset a shared or production database, and never delete confidential CSVs as part of a reset.

## Validation environment

Implementation used a new isolated PostgreSQL cluster in ignored `artifacts/stage02-postgres/cluster`, bound to `127.0.0.1:55432`, with a dedicated `relay_stage2_dev` database. Its randomly generated credential is stored only in ignored local files; no existing PostgreSQL service/database was changed. Root `.env` is configured for this local database with read APIs disabled by default.

To start that already-initialized validation cluster on this workstation:

```powershell
& 'D:\Apps\PostgreSQL\bin\pg_ctl.exe' -D "$PWD\artifacts\stage02-postgres\cluster" -l "$PWD\artifacts\stage02-postgres\postgres.log" -o '-h 127.0.0.1 -p 55432 -c timezone=UTC' -w start
```

To stop only that cluster:

```powershell
& 'D:\Apps\PostgreSQL\bin\pg_ctl.exe' -D "$PWD\artifacts\stage02-postgres\cluster" -m fast -w stop
```

Do not commit or publish the cluster, logs, password file or `.env`. Other developers should provision their own credentials and database rather than copy this validation environment.

## Remaining work

Stage 3 must implement real users/authentication, password/session handling and backend role/outlet authorization. Allocation, feasibility enforcement, lifecycle mutation services, stock reconciliation, durable sync and frontend integration remain unimplemented. Schema enums and relational constraints are foundations for those services, not substitutes for them. See [the data model](../data-model.md) for enforced invariants and explicit service-level responsibilities.

## Recorded validation

Validated on the `stage2` branch with Node 24.14.1, PostgreSQL 18.3 and Prisma 7.10.0. The initial checkout was clean at `c0e6165`; work continued from the existing Stage 2 edits when requested. No commits, pushes, branch changes or resets were performed.

| Command/check | Result |
| --- | --- |
| `npm install --fetch-retries=0 --fetch-timeout=20000` | Passed after granting registry access; client generated by postinstall; zero reported vulnerabilities after targeted dependency fixes |
| `npm run db:validate` / `npm run db:generate` | Passed |
| `npm run db:migrate` | Both migrations applied; rerun reported no pending migrations |
| `npm run db:seed` / `npm run db:counts` | 120 outlets, 60 vehicles, 2 depots, 910 calendar days, 5 demo orders, 1 demo trip, 4 demo users |
| `npm run db:status` | Database schema up to date |
| `npm run test:data` | 2 passed |
| `npm run test:foundation` | 9 passed |
| `npm run test:db` | 5 passed; repeat seeding and all required database field checks included |
| `npm test` against Vite | 27 passed, zero skipped |
| `npm test` with `RELAY_URL=http://127.0.0.1:3001` | 27 passed, zero skipped |
| `npm run build` | Passed; original CSS and classic scripts unchanged |
| Source-file integrity | SHA-256 hashes unchanged for all three input CSVs |
| HTTP confidentiality | Exact CSV paths, traversal paths, secrets, Git and Prisma sources rejected in Vite and Express |
| Git checks | Frontend unchanged; browser coverage preserved with the reload synchronization correction below; `data/`, local `.env` and database cluster ignored; no data files tracked |

Initial schema validation identified a missing composite uniqueness declaration for the one-to-one order/allocation relation; it was corrected before migration. Import validation was corrected to preserve the supplied Sunday-only weekend convention. No failing validation checks remain. The frontend still uses prototype data by design; the database is ready for later authenticated services.

### Stage 2 follow-up verification

Reviewing the existing working tree confirmed the implementation, migrations and source CSV hashes remained intact. A browser rerun exposed a Warehouse reload race: the readiness condition could match the old document just before it was replaced. The test now marks the old document and waits for a new document with initialized state and the rendered Warehouse view. This changes only test synchronization, not UI behavior or workflow assertions. An initial Chrome debugging-port startup failure was resolved with a fresh isolated browser profile. Stage 3 work was not started, and all implementation changes remain uncommitted for review.

After the correction, all 27 tests passed against Vite and again against the standalone Express production entry (`npm start`). A preceding Express attempt timed out during a development-watch restart. The follow-up also passed Prisma validation/generation, migration deployment/status, seed, all five database checks, both data checks, all nine foundation checks and the production build. Prisma reported no schema difference. `git diff --check` passed, the frontend remained unchanged, and all three confidential CSV hashes matched the original values. Validation servers and the isolated database cluster were stopped afterward; the seeded database was preserved.
