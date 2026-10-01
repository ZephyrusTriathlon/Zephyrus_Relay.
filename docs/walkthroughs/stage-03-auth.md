# Stage 03: authentication and authorization

## Setup and four accounts

The working tree was verified clean before implementation. No commits or pushes were made.

Configure root `.env` with the dedicated local `DATABASE_URL`, `RELAY_ALLOW_SEED=true` and a random `SESSION_SECRET` of at least 32 characters. Run `npm ci`, `npm run db:migrate`, `npm run db:seed`, then `npm run dev`. Seeding is prohibited in production. Existing Stage 2 demo accounts are upgraded when their password hash is absent; reseeding preserves passwords and operational progress.

| Email | Employee ID | Role |
| --- | --- | --- |
| dispatcher@relay.demo | dispatcher | DISPATCHER |
| loader@relay.demo | loader | LOADER |
| driver@relay.demo | driver | DRIVER |
| store@relay.demo | store | STORE_MANAGER |

All four development accounts use **`RelayDemo!26`**. Each has an independently salted bcrypt cost-12 hash. No browser script contains credentials. Existing non-demo users without a hash cannot log in. Provisioning/password recovery is outside this stage.

## Login and logout

Open http://localhost:4173, enter an email or employee ID and password, then select **Sign in**. The frontend posts to `/api/auth/login` and obtains identity from `/api/auth/me`. Login regenerates the session ID and stores only the user ID and cookie metadata in PostgreSQL's `Session` table. The server reloads the active user and assignments on every request. Unknown accounts and wrong passwords receive the same 401 message; passwords over bcrypt's 72-byte input limit are rejected.

Refresh preserves the signed-in account. **Account → Sign out** posts to `/api/auth/logout`, deletes the server session and clears the cookie. Log in again to authenticate as another employee. Prototype order progress remains in this browser, separate from identity. Hash navigation and old `relay_session` localStorage entries cannot grant backend permissions.

Sessions expire after eight hours without renewal. The frontend checks `/me` at startup, on window focus and every minute while signed in. A 401 closes open dialogs and returns to login. An unavailable identity service fails closed to login. Failed logout reports failure rather than claiming the session was destroyed.

## Cookies and deployment

`relay.sid` is HttpOnly, SameSite=Lax, Path=/, with an eight-hour lifetime. Local HTTP development uses Secure=false. `NODE_ENV=production` uses Secure=true and requires a 32+ character `SESSION_SECRET`; serve through HTTPS. Set `TRUST_PROXY=true` only when exactly one trusted reverse proxy terminates TLS and the API is not directly exposed. Otherwise leave it false. Use the same secret across API instances/restarts. With no development secret, a random process-local secret invalidates cookies after restart. PostgreSQL session storage has no memory fallback. Expired rows cannot authenticate; periodically delete expired `Session` rows as database maintenance.

Mutations reject cross-site browser requests and mismatched Origin headers. Auth responses are no-store. Database/session failures return sanitized errors. Password hashes are excluded using explicit Prisma selections from identity responses; login returns only `{ok:true}`.

## Backend RBAC and scope foundations

`requireAuth` returns 401 without an active session. `requireRole` returns 403 for the wrong role. These authenticated diagnostic endpoints expose server-derived filters, not operational records:

| Endpoint | Required role | Query foundation |
| --- | --- | --- |
| `/api/dispatcher/scope` | DISPATCHER | Planning-wide orders and trips |
| `/api/store/scope` | STORE_MANAGER | Assigned outlet orders and trips stopping at that outlet |
| `/api/loader/scope` | LOADER | Assigned depot, RELEASED / LOADING / READY trips |
| `/api/driver/scope` | DRIVER | Trips assigned to the signed-in user ID |

Missing outlet/depot assignments produce a nonmatching scope. Unsupported entity access has no filter and must be rejected by future services. Future endpoints must combine role middleware with these filters, never accepting browser identity or assignment fields as authorization. Existing opt-in loopback development reads also require DISPATCHER and remain unavailable in production. The seed assigns Store Manager an outlet, Loader the demonstration depot, and Driver the demonstration trip. The seed trip is DRAFT, intentionally outside Loader's released-trip scope.

To verify RBAC, log in as Store Manager and request `/api/dispatcher/scope` and `/api/driver/scope` in the same browser: both return 403. Log out: `/api/auth/me` returns 401. Log in as the appropriate employee: their scope endpoint returns 200. Editing hashes or localStorage does not change these responses.

## Prototype switching and developer controls

Removed the embedded account/password array, quick account picker, account-dialog switching and cross-role handoff buttons. The only account-change workflow is logout, login, server authentication. Historical Designathon documents/case-study sources remain historical and are not served by the live static allowlist.

`VITE_ENABLE_DEV_TOOLS` defaults to false. True enables only prototype **Simulate offline / Reconnect** controls; default builds omit them. There are no dev authentication bypasses, impersonation endpoints or role pickers. Existing local prototype workflow/offline records are not secure operational storage; operational endpoints and durable synchronization come later. Rebuild after changing a Vite flag.

## Verification

Run `npm run build`, `npm run test:foundation`, `npm run test:data`, `node --test tests/auth.test.js` and `npm run test:db` against the seeded local database. Auth tests use actual PostgreSQL sessions, all four logins, invalid credentials, unauthenticated/authenticated identity, logout revocation, required role denials, session rotation, persistence across API instances, password hashing/non-disclosure and production cookie configuration.

For browser regressions, start the development server with `VITE_ENABLE_DEV_TOOLS=true`, launch a separate Chrome profile on debugging port 9222 as described in README, and run `npm test`. Credentials in the test runner are fixtures, never shipped browser assets. Tests authenticate through HTTP and use visible logout/login for workflow handoffs; operational/layout assertions remain in place.

### Recorded results

- Migration applied and seed retained exactly four demo users plus all existing network counts.
- Prisma validation and production build passed.
- `npm test`: 38 passed, zero failures or skips, including the existing browser workflow and new forged-role/expired-session checks.
- `npm run test:db`: 5 passed, including repeatable seeding and authenticated development reads.
- Built frontend served by Express: real Loader login, default developer controls absent, no account picker, Dispatcher API denied.
- Built assets contain no demo passwords, account array, account-switching actions or password hashes. `git diff --check` passed.
