# Stage 01: application foundation

The working Relay frontend remains the implementation source of truth. Stage 1 adds npm workspaces, Vite, an Express health API and a small JavaScript domain package. No database, real authentication, allocation service or offline synchronization was introduced.

## Architecture and preservation

- `apps/web`: original HTML, four active stylesheets and five classic UI scripts; Vite development/build configuration and an ES module for API configuration.
- `apps/api`: Express app factory and separate startup entry. JSON parsing is limited to 100 KB, Helmet supplies security headers, unknown API routes return JSON 404s and errors return sanitized messages. Zod validates host/port startup input. Health accepts no payload requiring a request schema.
- `packages/domain`: frozen `Roles` constants only. Prototype planning stays in the frontend; legacy role strings are intentionally unchanged.

The former static server bound to `127.0.0.1:4173` and allowed only the live HTML/CSS/JS files. It has been replaced. The original script order is workspace, dispatch, store, field, script. These scripts share lexical globals and browser tests inspect them; converting them independently would break the application. Vite therefore copies those five scripts unchanged into the build and preserves their classic script order. CSS is processed by Vite without source changes. New configuration/server code uses ES modules.

Hash routes remain `#store`, `#dispatch`, `#loader`, `#delivery`, gated by the simulated account. `relay-v1` still stores operational state and `relay_session` stores the demo account ID. No storage migration or UI redesign occurred. Historical case-study files are not live assets.

## Install and run

Use Node 24 or newer and npm from the repository root:

```powershell
npm ci
npm run dev
```

Open http://localhost:4173. Both processes stop when the combined command is stopped. To run them in separate terminals:

```powershell
npm run dev:web
npm run dev:api
```

Vite binds to loopback port 4173 with strict port selection. Express defaults to loopback port 3001. `GET http://127.0.0.1:3001/api/health` returns `{"status":"ok","service":"zephyrus-relay-api"}`. Vite proxies `/api/*` to Express so local development needs no CORS configuration.

Optional configuration: copy each application's `.env.example` to `.env` in that same directory. API startup reads `apps/api/.env`; Vite reads `apps/web/.env`. `HOST` and `PORT` configure Express. `API_PROXY_TARGET` configures the Vite proxy; change it together with the backend port. `VITE_API_BASE_URL` defaults to `/api` and is public build-time configuration, never a place for secrets. `apps/web/src/config.js` exports `API_BASE_URL` and `getHealth()` for future API consumers; no prototype workflow calls a business API.

## Build and production entry

```powershell
npm run build
npm start
```

The build is in ignored `apps/web/dist`. Express serves that build and `/api/health` on http://localhost:3001. Build before starting if you want the UI; the API can run without a build. The application can later be packaged in Docker with a build step and this Node entry, but no Docker infrastructure is included yet. Set `HOST=0.0.0.0` explicitly when a later deployment requires external binding.

## Static security

`publicDir` is disabled. Datasets are never copied into the build. Development requests pass through an exact asset allowlist, with only Vite's client runtime added. Raw traversal/dot/data segments are rejected before framework normalization, and realpath checks reject symlinks outside the served root. Production and Vite preview serve only the entry, the five classic scripts and generated JS/CSS assets. There is no arbitrary-path SPA fallback because navigation uses hashes.

`/data/`, `/.git/`, `/.env`, `/package.json`, `/README.md`, internal source, historical case-study files and arbitrary `/@fs/` reads remain inaccessible. The shared static policy is server configuration, not a browser asset. Helmet's default inline-style allowance preserves the prototype's dynamic style attributes; upgrade-insecure-requests is disabled for local HTTP operation. Deployment TLS policy belongs to deployment hardening.

## Tests

```powershell
npm run build
npm run test:foundation
```

Foundation tests start temporary API/Vite servers on ephemeral ports and cover health, proxying, entry/assets, private paths, malformed JSON and body size limits. Production entry tests require the build above.

For the complete existing browser regression suite, leave `npm run dev` running and start a separate Chrome debugging profile as described in the README, then:

```powershell
npm test
```

The original browser tests are retained, including all four role views, connected workflows, responsive layouts and runtime errors. They default to http://127.0.0.1:4173 and Chrome debugging port 9222. `RELAY_URL` and `RELAY_CDP_URL` override those endpoints. To test the production UI with Express running, set `$env:RELAY_URL='http://127.0.0.1:3001'` before `npm test`. The browser suite preserves prior Relay localStorage and uses its own tab. Captures stay in ignored `artifacts/`.

## Prototype boundaries and Stage 2 prerequisites

Demo credentials and role gating remain frontend-only. Orders, constraints, ETAs, stock, delivery receipts and the offline queue remain simulated localStorage state. The health route is the only API functionality. Stage 2 needs a reviewed PostgreSQL schema, Prisma setup/migrations, secure dataset ingestion outside web roots, environment/secret management and a persistence/API contract. Real authentication and authorization, allocation and durable offline synchronization require their own agreed implementation scope. Do not treat the demo login or queue as backend infrastructure.

## Implementation validation

Validated with Node 24.14.1 and npm 11.11.0. The initial checkout was clean on `main` at `69eaa3e`. No commit, push, branch change, reset, restore, stash or clean was performed.

Commands executed for setup and verification:

```powershell
git status
git branch --show-current
git log -1 --oneline
npm install
npm install --fetch-retries=0 --fetch-timeout=20000
npm run build
npm run dev
npm run test:foundation
npm test
$env:RELAY_URL='http://127.0.0.1:3001'
npm test
npm ls --depth=0
npm start
Invoke-RestMethod http://127.0.0.1:3001/api/health | ConvertTo-Json -Compress
(Invoke-WebRequest http://127.0.0.1:3001/ -UseBasicParsing).StatusCode
git diff --exit-code -- apps/web/src/scripts apps/web/src/styles
git diff --check
git status --short
```

The sandboxed install stalled and was interrupted; the second install completed with network permission (112 packages added, zero reported vulnerabilities). An early build attempted before installation finished failed because Vite was not yet available; the subsequent production build passed. Initial HTTP assertions were corrected for Vite's CSS content negotiation and raw traversal URLs. Foundation tests then passed 6/6. Browser screenshots initially hit a sandbox permission error; rerunning with permission passed all 22 tests, zero skipped, against both Vite and Express. The browser suite itself was unchanged. Chrome was launched using the README command with the separate `.browser-qa-stage-01` profile.

The frontend and API started successfully together; the separate `npm start` production entry also served health and HTML successfully. Original script and CSS sources have no diff. SHA-256 comparisons confirmed all five built classic scripts match their sources byte for byte. Generated build assets and browser screenshots remain ignored. No known failing checks remain; real persistence, authentication and synchronization remain deliberate later-stage work.
