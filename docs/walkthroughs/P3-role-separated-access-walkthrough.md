# P3 Role-Separated Access Walkthrough

## 1. Objective

The four personas are four distinct people using one Relay application. Each employee account has a fixed role that determines its workspace. Switching demo accounts exists only to help judges demonstrate connected work across those people.

## 2. Product Model

One system -> four seeded accounts -> fixed roles -> role-specific experiences -> shared workflow state.

Waypoint conceptually assigns access. Employees cannot register publicly or assign themselves a role. Normal navigation offers their own workspace and Account. The connected-workflow indicator is informational.

## 3. Seeded Demo Accounts

These identities and credentials are fictional prototype data. All four passwords are deliberately public demo credentials.

| Display name | Login identifier | Employee ID alternative | Demo password | Assigned role |
| --- | --- | --- | --- | --- |
| Nimasha Perera | store@relay.demo | store | RelayDemo!26 | STORE_MANAGER |
| Dinuka Fernando | dispatcher@relay.demo | dispatcher | RelayDemo!26 | DISPATCHER |
| Kasun Silva | loader@relay.demo | loader | RelayDemo!26 | LOADER |
| Amal Perera | driver@relay.demo | driver | RelayDemo!26 | DRIVER |

## 4. Files Changed

- `workspace.js`: fictional accounts, session helpers, login, demo account dialog, fixed-role shell and informational workflow indicator.
- `script.js`: session actions, hash gating, explicit demo handoffs and session-preserving reset.
- `styles.css`: responsive login and account dialog styling using existing Relay tokens.
- `case-study.js`: distinct-user rationale and explicitly labeled Driver failure-demo entry.
- `README.md`: credentials, account-switching judge instructions and prototype limitations.
- `tests/browser.test.js`: account access coverage, session restoration and existing workflow tests adapted to demo account switching.
- `docs/walkthroughs/P3-role-separated-access-walkthrough.md`: this walkthrough and verification record.

## 5. Login Flow

1. Open http://localhost:4173 with no Relay session to see the login screen.
2. Enter an email or employee ID from the table and its demo password.
3. Missing identifier, missing password and incorrect credentials produce inline errors; the relevant input receives focus. Enter submits the form.
4. Successful sign-in opens only that account's workspace.
5. Refresh retains the signed-in account. An unrecognized session identifier displays login.

## 6. Role Access

| Role | Workspace | Relevant work |
| --- | --- | --- |
| STORE_MANAGER | Store (`#store`) | Ordering, ETA, receipt confirmation and discrepancy reporting |
| DISPATCHER | Dispatch (`#dispatch`) | Planning, allocation, validation, monitoring and receipt follow-up |
| LOADER | Warehouse (`#loader`) | Released manifests, loading checks and exception resolution |
| DRIVER | Delivery (`#delivery`) | Assigned route, offline actions, delivery exceptions and POD |

Changing the hash to another role returns to the signed-in account's workspace. The shared Design case study remains available as prototype evidence. Its account handoffs open the explicit demo account dialog.

## 7. Demo Account Switching

Open **Account > Switch demo account**, then choose a named fictional employee. The dialog identifies each person's assigned role and email. It replaces the session identifier, simulating sign out followed by sign in as that person. Orders, route progress, receipts and offline updates remain unchanged.

This is a labeled judge shortcut, not a role selector for the employee. The same secondary shortcut appears on login and at workflow handoffs. A selected account always retains its original fixed role.

## 8. End-to-End Manual Walkthrough

For a fresh run, use Design case study > Reset demo, then switch to Store. Between the following steps, use Account > Switch demo account.

1. Sign in as `store@relay.demo` with `RelayDemo!26`.
2. Use recommended quantities, choose Review order, then Place order. Note ORD-2847 for OUT006.
3. Switch demo account to Dinuka Fernando, Dispatcher. The newly placed order is revealed in the queue.
4. Assign ORD-2847 to R-07, review the feasibility checks with VEH003, then Confirm plan > Confirm & release.
5. Switch to Kasun Silva, Loader.
6. Check shipments in reverse stop order. Try Missing / issue, resolve with a note, Confirm loaded for each shipment, then Complete loading.
7. Switch to Amal Perera, Driver.
8. Start route. At each stop record arrival, verify cartons, enter recipient and time, and save POD. Optionally toggle offline before delivery and reconnect afterward.
9. Switch back to Nimasha Perera, Store, and open Order tracking.
10. View the ORD-2847 receipt. Report an issue with a type and details to demonstrate follow-up; Confirm receipt after checking cartons to demonstrate stock reconciliation. Both records can coexist in this prototype.
11. Switch to Dinuka Fernando, Dispatcher.
12. Open Route and inspect ORD-2847 receipt follow-up. The delivery remains completed while the Store discrepancy stays visible.

## 9. Expected Results

| Steps | Expected result |
| --- | --- |
| 1-2 | Store identity and ordering controls; ORD-2847 persists in shared state |
| 3-4 | Same order in Dispatch; assignment adds planned ETA; release locks the plan |
| 5-6 | Released manifest and reverse loading sequence; resolved exceptions permit completion |
| 7-8 | Assigned stops and POD validation; offline updates survive refresh and clear on reconnection |
| 9-10 | Store sees the same Driver POD; receipt confirmation updates stock; issue details persist |
| 11-12 | Dispatch shows completed delivery and separate Store receipt follow-up |

## 10. Session / State Behavior

- `relay_session` stores only a seeded account ID; it contains no password or token.
- `relay-v1` remains the shared operational record. Existing saved operational data requires no account migration.
- Refresh reloads the current account and operational data.
- Sign out removes only the session and returns to login.
- Demo switching replaces only the account session and preserves the shared workflow.
- Reset demo restores operational seed data while retaining the current account and its workspace. The confirmation dialog states this behavior.
- The existing **Load failure demo as Driver** evidence action explicitly selects the Driver demo and loads the isolated failure scenario, replacing operational data as before. Use the ordinary connectivity control to demonstrate offline behavior without replacing the current journey.

## 11. Responsive / Accessibility QA

Login verified at **1440, 1024, 430, 390 and 360px**; screenshots are in ignored `artifacts/login-*.png`. The mobile logo initially inherited the collapsed-sidebar brand rule; a login-specific override fixes it.

Existing role layout checks pass at **360, 390, 430, 768, 834, 1024, 1280 and 1440px**. Field action bars, navigation and toasts retain their existing overlap checks. The new account controls reuse the existing dialog's accessible heading, focus containment, Escape handling and focus restoration. Login has explicit labels, password masking, inline alert text, invalid-field feedback, visible focus and Enter submission. Reduced-motion rules remain intact.

Browser automation was adjusted to send a real Enter character for native form submission and wait for a new document after refresh. Account-dialog selectors are scoped to the open dialog so background handoff buttons do not intercept test clicks.

## 12. Automated Verification

Run `npm test` with the app on port 4173 and Chrome debugging on port 9222.

Final result: **18 tests, 18 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo** (0 suites).

Coverage includes all four credentials, empty/invalid login, direct hash gating, session refresh, sign out, unchanged shared state on account switching, session-preserving reset, the connected order lifecycle, ETA, receipt confirmation/issues, offline recovery, responsive layouts and no uncaught browser errors. Both P2 static-server tests pass, including protected internal/data/traversal paths. Tests restore the previous operational data and session and preserve unrelated localStorage.

## 13. Competition / Product Rationale

Role separation makes the Designathon experience depict the intended enterprise product: one connected system used by different employees with different tasks and devices. Store needs ordering and receiving; Dispatch needs feasibility and monitoring; Loader needs released manifests and exceptions; Driver needs an actionable route, offline capture and POD. Fixed accounts keep those responsibilities clear while shared state demonstrates every handoff. A later Hackathon implementation can replace the simulation with actual account provisioning and server authorization.

## 14. Known Limitations

Authentication is frontend-only and simulated. The localStorage account identifier can be edited, and frontend code can bypass role gating. There is no server-side authorization, real account provisioning, password security, expiry or cross-device session management. The four demo passwords are visible in frontend source by design. Shared data remains local to this browser; offline synchronization is illustrative.

## 15. Out-of-Scope Items

Real authentication, public signup, employee role self-selection, admin user management, backend, database, password reset, OAuth/JWT, Hackathon architecture, Style/Tech expansion and Datathon work were not added. No dependencies or package files changed. Competition datasets and server security logic were not changed or exposed. There was no unrelated redesign or refactor.

## 16. Git Summary

Starting state: `git status --short` produced no output; `git branch --show-current` returned `main`.

Exact changed files:

- `README.md`
- `case-study.js`
- `script.js`
- `styles.css`
- `tests/browser.test.js`
- `workspace.js`
- `docs/walkthroughs/P3-role-separated-access-walkthrough.md` (new)

Staged: **no**. Committed: **no**. Pushed: **no**. No reset or destructive checkout was performed. Diff review and whitespace checks were followed by the final `npm test` run.
