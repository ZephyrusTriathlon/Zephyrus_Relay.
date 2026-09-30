# P2 Security Hardening Walkthrough

## 1. Objective

Prevent the local static server from returning competition datasets or repository-internal files through HTTP while keeping the existing application available.

## 2. Implementation Summary

The server now serves only the application files allowed under `apps/web/`. Protected or invalid requests receive the same `404 Not found` response as missing files.

## 3. Files Changed

- `apps/web/server.js`: validates request paths and limits serving to application assets.
- `tests/server.test.js`: checks normal assets and protected or traversal-style requests.
- `docs/walkthroughs/P2-security-hardening-walkthrough.md`: records verification steps and scope.

## 4. Request-Path Validation

The server decodes the request path, treats forward and backslashes as separators, and rejects hidden segments, traversal segments, and the `data` directory. It resolves the path against the application root and checks that both the resolved path and final real filesystem path stay within that root. Only files referenced by the current application are served. This also blocks internal files such as server code, tests, documentation, and package metadata. Missing and blocked paths return the same 404 response.

## 5. Manual Walkthrough

1. Start the server with `npm start`.
2. Open `http://127.0.0.1:4173/` in a browser.
3. Request `http://127.0.0.1:4173/src/scripts/script.js` and `http://127.0.0.1:4173/src/styles/styles.css`.
4. Request `http://127.0.0.1:4173/data/General%20Data/outlets.csv`.
5. Request `http://127.0.0.1:4173/.git/config`, `http://127.0.0.1:4173/.browser-qa/Default/Preferences`, and `http://127.0.0.1:4173/.env`.
6. Send a raw encoded traversal request with `curl.exe --path-as-is -i "http://127.0.0.1:4173/%2e%2e/src/scripts/script.js"`. Repeat with `"http://127.0.0.1:4173/data/../src/scripts/script.js"` to check normalization cannot bypass the data boundary.
7. Check that every protected request has status 404 and only the generic `Not found` body.

## 6. Expected Results

The application and its JS/CSS assets return 200 and load normally. Every data, hidden, internal, or traversal-style request returns 404 with `Not found`, regardless of whether the target exists locally.

## 7. Automated Verification

With the application server and Chrome debugging endpoint running, `npm test` passed: **16 tests, 16 passed, 0 failed, 0 skipped**. The existing browser workflow passed without uncaught browser errors; the two new server tests passed.

## 8. Competition Requirement Mapping

The local `data` directory is excluded from HTTP serving. This protects locally supplied competition files without copying, changing, or loading them into the browser.

## 9. Known Limitations

Adding a new public application asset requires adding its filename to the server's asset set.

## 10. Out-of-Scope Items

No UI, role workflow, dataset, dependency, authentication, deployment, or production web-server behavior was changed.

## 11. Git Summary

Changed files: `server.js`, `tests/server.test.js`, and this walkthrough. Nothing was staged, committed, or pushed.
