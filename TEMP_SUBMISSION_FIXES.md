# Submission readiness changes — working record

Scope: fix audit items 2–9. The user owns the local frontend rebuild, public deployment, video and submission. No deployment or submission is performed here.

## Plan and decisions

- Package exact supplied operational CSVs for the default seed and Docker image; preserve reference values.
- Add explicit, disclosed judge mode with a fixed historical business date; retain real-clock behavior outside judge mode and preserve authentication/security defaults.
- Implement audited deferred-order carry-forward with operating-date and concurrency validation.
- Support frozen goods throughout schema, catalogue, ordering and allocation.
- Require an active Driver before release.
- Expose calendar demand context and apply a documented conservative monsoon travel allowance.
- Make the server catalogue authoritative for product specifications.
- Put the numbered walkthrough directly in README and update current documentation.

## Changes implemented

1. Replaced five simplified judge CSVs with exact supplied files and added a SHA-256 manifest plus Git byte-preservation attributes. The packaging script now copies supplied files rather than inventing references. Seed refuses mismatched pre-existing reference values.
2. Added explicit production-compatible judge mode, a covered historical business date, demo-account startup guard, authenticated scenario metadata and a visible banner. Real-clock operation remains selectable. Session/security and delivery timestamps remain real.
3. Added a server-owned six-product catalogue including frozen vegetables. Store loads its catalogue from the API. Server rejects unknown codes, forged specifications, duplicate product lines and temperature mismatches; carton specifications are stored from the authoritative catalogue.
4. Added the sixth migration: FROZEN enum and original requestedDeliveryDate. Frozen uses the refrigerated vehicle constraint throughout ordering and planning.
5. Added versioned, locked Dispatcher carry-forward with a required reason/explanation, target operating-day validation, preserved original date, deferral and status audit records, and a UI dialog. Retrying the original order submission after rescheduling still recovers its original identity.
6. Blocked atomic release when any draft lacks an active Driver; added UI guidance and disabled premature confirmation. Normal assignment remains available in draft review.
7. Exposed calendar demand flags and implemented a disclosed conservative 20% monsoon travel-time allowance, including return legs. Existing old-policy reservation metrics are recomputed.
8. Added the numbered README walkthrough and updated the detailed judge guide, architecture, data model, AI disclosure and current readiness report. Historical reports are identified as historical.
9. Updated regression fixtures to use real catalogue products and assign Drivers through normal review. Added frozen/monsoon, tampering, judge startup, concurrency, carry-forward API/UI and release-readiness checks. Fixed test isolation for Secure-cookie assertions and the legacy browser suite's Vite WebSocket server.

## Verification and environment

- Schema validation and Prisma client generation passed.
- All six migrations and the supplied seed passed on a new isolated QA database (120 outlets, 60 vehicles, two depots, 910 dates, five seeded orders, one trip, four accounts).
- An isolated production frontend build was created under ignored artifacts/submission-fixes/web-dist; the user's normal apps/web/dist was not rebuilt or replaced.
- Full serial regression passed **141/141**; database integration passed **5/5 twice** inside that run. The fresh supplied-data judge walkthrough passed **7/7**, including all four roles, eleven viewport widths, offline reload/sync and final receipts. Ordinary production server startup, login and the judge ordering context also passed.
- Initial runs exposed test-harness configuration problems, which were corrected without relaxing application assertions. Accepted logs: artifacts/submission-fixes/regression-accepted.log and judge-accepted.log. The existing PostgreSQL concurrent-query deprecation warning remains non-fatal.
- A separate hidden Chrome profile is used for real network-offline and browser checks. Detailed logs are under ignored artifacts/submission-fixes/.
- The offline test harness now resolves its Service Worker from the configured isolated build, matching the server's frontend root. Its final focused rerun passed **17/17**.
- The user's .env and operational database are unchanged. Use a fresh database when upgrading from the simplified references and configure the new judge mode explicitly in an existing .env.
- Docker is unavailable here. Final fresh Compose startup must be checked on a Docker-equipped machine. Public deployment, video, submission and human team sign-off remain with the user.

For the current report and exact local upgrade steps, see docs/submission-readiness.md. Changes remain local for team review and commit/push. Temporary editing helpers are removed after verification; ignored QA evidence and its runner are retained separately from submission source.
