# Stage 08: real Driver offline work and reconciliation

This is real Chrome network-offline operation, not the historical Designathon toggle. PostgreSQL remains authoritative. Offline changes are provisional until acknowledged by the same Stage 7 operational service used online. The existing Driver layout, next-stop controls, return visits, delivery dialogs and bottom navigation are retained.

## Run the judge build

Use the project's Node 24+ requirement, PostgreSQL and existing `.env`. Set a stable, random `SESSION_SECRET` (at least 32 characters), and leave `VITE_ENABLE_DEV_TOOLS=false`. Do not rotate that secret while devices hold unsynchronized work: it derives per-Driver encryption keys. Do not clear browser site data while work is pending.

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Open **http://127.0.0.1:3001/** in Chrome (or the configured API port). Use this same origin throughout the demonstration. Deployed offline support requires HTTPS. The built Express app/production preview includes the generated Service Worker; Vite's source-development server is not the offline judge build.

Use an actual assigned Stage 7 trip. On an unused seed, follow [Stage 7](stage-07-end-to-end.md) to release `demo-trip-01` / `DEMO-2025-01-02-01` and complete Loader checks. It has two physical stops (OUT004, OUT005), three allocations and is assigned to `demo-user-driver`. If it was already completed, do not reset it: use another legitimately assigned READY/IN_PROGRESS trip. The automated test below creates its own three-stop assigned trip, preserving judge records.

## Chrome walkthrough

1. Sign in online as `driver@relay.demo` (development seed password `RelayDemo!26`). Select the assigned trip. Wait for **Trip saved for offline use.** in the connection panel. Application → Service Workers should show an activated worker, and the current trip should be visible.
2. For READY trips, press **Start route** while online. Confirm the trip is IN_PROGRESS. Starting an unprepared route remains online-only and server-validated.
3. Open Chrome DevTools → Network → throttling dropdown → **Offline**. Do not press a simulated offline control. Reload the page. The Driver remains in the previously authorized field context; **Morning route**, ordered stops, quantities/windows and the selected trip remain visible. The connection panel says **Offline**.
4. Press **I've arrived**. The action is saved durably and the panel reports a saved action **pending sync**. Press **Verify & confirm delivery**, enter the recipient, verify the expected carton count, tick the verification checkbox, and confirm delivery. The provisional POD is retained locally; no PostgreSQL delivery has yet been written.
5. At another outstanding stop, use **Report a delivery issue**, enter meaningful details and **Save & return later**. Continue to other cached stops. When appropriate, use **Retry stop**, describe what changed, arrive again and complete the delivery. Local validation is only immediate form feedback; the server will revalidate everything.
6. Reload while still Offline. Pending count, action IDs, local progress and chosen trip survive. Leaving/reopening the application on the same browser profile retains IndexedDB work too. A completed local route says **Deliveries saved. Pending sync.**, not that PostgreSQL accepted it.
7. Try Account → Sign out with pending actions: sign-out is blocked with **Sync or resolve your saved deliveries before signing out. Nothing has been discarded.** Closing the dialog returns to the route.
8. Change DevTools Network back to **No throttling**. Reconnection initiates **Syncing**; **Sync now** also initiates a bounded attempt if a reachability hint was missed. For small batches, Syncing may be brief. Arrival is acknowledged before its POD. Entries are removed only after acknowledgement. On full success the panel says **Synced**, zero pending actions remain, and an authoritative assigned-trip refresh replaces provisional progress.
9. Sign out normally (now permitted). Sign in as Store and open the delivered OUT004 order: the real POD and recipient are visible; Store receipt confirmation can continue to RECEIVED. Sign in as Dispatcher, load the trip's business date and reload: real downstream stop/trip status and exception history are visible.

For actual CDP network control, the automated suite sends `Network.emulateNetworkConditions` with `offline:true`, then reloads. No localStorage flags implement the demonstration.

## PostgreSQL verification

Inspect the chosen trip/allocation IDs, not global counts. For the seed scenario, the read-only query below shows POD and order status:

```sql
SELECT a.id AS allocation_id, o.status, p.recipient, p."deliveredCartons",
       p."deliveredAt", p."recordedAt"
FROM "Allocation" a
JOIN "Order" o ON o.id = a."orderId"
LEFT JOIN "ProofOfDelivery" p ON p."allocationId" = a.id
WHERE a."tripId" = 'demo-trip-01';
```

Inspect `DeliveryEvent`, `OrderStatusEvent` and `SyncMutation` for those owned IDs. `DeliveryEvent.occurredAt` / `SyncMutation.clientOccurredAt` represent the claimed field-action time; `recordedAt`, `receivedAt` and `appliedAt` remain server-generated. Replaying an accepted key must not create another event, exception, POD or order-history transition.

## Storage and Service Worker

- Dexie **4.4.6** is bundled locally, not loaded from a CDN.
- Build generates `/sw.js` with a content-hashed `relay-shell-*` cache name and an exact shell allowlist. Install precaches public HTML, built JS/CSS and the Dexie vendor asset; activation removes older Relay shell caches. Scope is this app's `/` origin; fetch interception is restricted to that exact allowlist and GET requests without query strings.
- `/api/*`, authentication/session responses, `/data`, arbitrary URLs and operational API responses are never placed in Cache Storage. The public HTML shell contains no user data or server-rendered authentication decisions.
- IndexedDB database `relay-driver-v1`, version 1: `vaults` keyed by `userId`, and `access` keyed by `id`. Each owner's vault is AES-GCM encrypted with fresh IVs and owner ID as authenticated data. Its structured payload contains minimized trip snapshots, selected trip, last refresh, monotonically ordered outbox and sequence counter. Encrypting the outbox and snapshot together makes their local update atomic.
- `access/active` holds only the currently authorized Driver metadata, local decryption grant and authorization time. The grant enables offline reopening for up to eight hours after successful online authorization; it is not a server credential. No password, HttpOnly session cookie or unrestricted fleet/order data is copied into IndexedDB.
- Local encryption uses short WebCrypto operations inside Dexie transactions; network requests are outside those transactions. See [Dexie transaction guidance](https://dexie.org/docs/Dexie/Dexie.transaction%28%29) and [Service Worker lifecycle guidance](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

## Outbox and API contract

Each encrypted outbox entry stores `id`, `idempotencyKey`, `userId`, `tripId`, `entityId`, `type`, `occurredAt`, `baseVersion`, `payload`, `state`, `lastError`, `createdAt`, and monotonic `sequence`. Supported types are ARRIVAL, DELIVERY_EXCEPTION, EXCEPTION_RESOLUTION and DELIVERY_COMPLETE (POD). UUIDs are generated before sending and persist across reload/lost responses. The UI's local projection is provisional presentation, not a second authoritative rules engine.

Delivery exception creation uses its mutation UUID as the persisted exception ID. An offline resolution includes `payload.exceptionId`, targeting either that earlier queued creation or an existing cached exception. This identity is immutable across retries. Older queued resolutions without a target are retained with `EXCEPTION_TARGET_REQUIRED`; they are never guessed or retargeted. The shared service keeps the Stage 7 single-open-issue rule: a new exception while another is open returns `EXCEPTION_ALREADY_OPEN`, not a success acknowledgement. Only replaying the exact accepted mutation key returns its original result. A resolution targeting a closed or unrelated exception returns `STALE_EXCEPTION_TARGET` without changing newer issues.

`POST /api/sync` requires the normal HttpOnly session, same-origin JSON and DRIVER role:

```json
{"mutations":[{"idempotencyKey":"<uuid>","tripId":"<assigned-trip>","entityId":"<allocation-id>","type":"ARRIVAL","occurredAt":"2026-10-03T07:00:00+05:30","baseVersion":123,"payload":{}}]}
```

Use the actual `baseVersion` returned with the assigned trip, not the example value. It fingerprints assignment, vehicle, departure, ordered stops, allocation identities, order windows and expected quantities. It excludes transient delivery progress so ordered dependent actions captured together share the manifest revision. No migration is needed.

The endpoint accepts 1–50 mutations and returns `results` plus scoped authoritative `trips`. A result contains its `idempotencyKey` and:

- `ACKNOWLEDGED`, with the original stable `{ok, actionId, acceptedAt}` acknowledgement;
- `NEEDS_ATTENTION`, with machine-readable `code` and operational `message`; or
- `PENDING` for transient server failure.

Identity fields such as `userId`/`driverId` are not accepted in mutation envelopes; identity comes from the session. Each action calls `operate(...)`, the Stage 7 service, which checks assignment, allocation relationship, manifest revision, quantity and lifecycle under its existing PostgreSQL transaction lock. Existing `SyncMutation` records in the `stage7-online` namespace atomically persist action request, capture metadata and acknowledgement with domain writes. Replays cannot evade actor/request matching.

Batch order is preserved. If an action fails, later actions for that trip are dependency-blocked; other trips can succeed. The client intentionally sends one action at a time, processes in stored sequence order, and stops a conflicted trip while retaining its dependent actions. Web Locks serialize synchronization across supported tabs. An eight-second request timeout and explicit reconnect/manual retries avoid background retry loops. `navigator.onLine` is only a hint; actual fetch failure switches to Offline.

## Conflicts and authentication safety

Assignment loss, manifest changes, cancelled/advanced lifecycle, incompatible POD and out-of-order requests are rejected by the shared service. Safely repeated accepted actions receive their original acknowledgement. A failed action remains visible as **Needs attention** with its reason; pending/dependent actions are not discarded, and the UI never claims Synced while they remain. **Retry sync** retries the original IDs after the underlying problem is resolved. Contact dispatch for non-retryable conflicts; there is no silent overwrite or automatic discard/rebase.

Session expiry requires online re-authentication before sync. The local unlock grant is removed; encrypted work remains. Only the original Driver's authenticated `/api/driver/offline-access` response can reopen that vault. Login/account changes lock the previous grant and broadcast an in-memory lock to other tabs. Another role or Driver cannot inherit the previous route or decrypt its retained pending records. Normal explicit logout is allowed only after pending work/sync finishes; it deletes that user's working copy and unlock grant after server logout succeeds. Offline logout cannot revoke a server session and therefore asks the user to reconnect rather than pretending it succeeded.

Startup distinguishes an authoritative 401/403 from an unreachable API. If connectivity disappears before session verification **or between session verification and fetching the offline-access grant**, the saved same-Driver grant is preserved and the previously authorized cached workflow restores as **Offline** (within its eight-hour authorization window). This is not confirmation of a current server session. Supported actions remain local until reconnection confirms the session. An authoritative 401/403 locks the grant and requires sign-in while retaining encrypted pending work. Confirming a different account never falls back to the old Driver's grant.

The regression suite interrupts startup using CDP request interception plus real network loss. It also tests exact outbox IDs after conflicts, lost responses for all four action types, malformed acknowledgements, and dependency blocking. Reload checks require a new document, login checks require the completed field-cache load, and conflict assertions wait for synchronization and rendering to finish; no success retries or longer arbitrary sleeps are used.

CDP request interception keeps API transport offline across Chrome's cross-document renderer changes, alongside `Network.emulateNetworkConditions`. A server-side counter asserts that zero sync requests escape while offline. Browser contexts are isolated by default. Driver-only fixtures use OUT005 to avoid filling OUT004's bounded Store list while the fixed-clock online walkthrough runs concurrently; the explicit end-to-end fixture still uses OUT004 for Store receipt. A separate deterministic regression covers Store refresh completion when a newer read supersedes an older read, and a logout regression rejects session checks started during an in-flight authentication change.

This protects normal account isolation on a shared browser, not against a compromised OS, browser extension or same-origin script execution while a Driver is unlocked. Use managed devices, HTTPS and the existing CSP; never share an unlocked field session. Browser storage eviction/site-data clearing can remove unsynchronized work, so do not clear site data before syncing.

## Verification

Start an isolated headless Chrome with remote debugging on 9222 (or set `RELAY_CDP_URL`), then run:

```powershell
npm.cmd run build
npm.cmd run db:validate
npm.cmd run test:offline
npm.cmd test
npm.cmd run test:db
git diff --check
```

Run the standalone database suite after the full suite finishes. No destructive reset is used. `tests/offline.test.js` creates uniquely owned trips/orders/vehicles/users and cleans only those IDs. Stage 1–7 test assertions remain unchanged. Its nine subtests cover role/assignment/payload boundaries; ordered partial batches and duplicate acknowledgements; cache upgrade/allowlist; real offline reload/application reopening and ordered exception/arrival/POD at 360/390/430; reconnect/Store/Dispatcher/history; lost response; retained reassignment conflict; session expiry plus encrypted cross-role/cross-Driver isolation and recovery; and work saved during an in-flight logout. The latter is retained encrypted, even if server logout has already succeeded.

The earlier 120/120 sign-off was superseded by the Stage 8 re-audit. Final consecutive-run results for the corrected implementation are recorded below only after verification. The host has Node 22.18.0 and npm 11.6.2; no Node 24+ installation was found in PATH or the installed NVM manager. The repository's Node 24+ requirement is unchanged. The existing PostgreSQL adapter emits a non-failing concurrent-query deprecation warning.

Limitations: route start, loading, planning, Store receipt and external map navigation need a connection; only a previously opened authorized Driver manifest works offline. Background Sync is not required. Conflicts require review rather than automatic overwrite. Development-only historical simulation remains gated by `VITE_ENABLE_DEV_TOOLS=true` and is not evidence of real offline functionality.
