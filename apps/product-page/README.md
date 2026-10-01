# Relay product page

Independent marketing site using the application's existing vanilla JavaScript, CSS and Vite stack. No backend, authentication session, operational state or private dataset is loaded. No new runtime dependencies.

From the repository root:

```sh
npm ci
npm run dev:product
```

Open http://127.0.0.1:4174. For a production build and local preview:

```sh
npm run build:product
npm run preview:product
```

Deploy `apps/product-page/dist/` to a static host. Relative build paths allow hosting under a subdirectory. The existing application still uses its unchanged commands and port 4173.

## Organization

- `src/main.js`: section components, navigation and accessible role tabs.
- `src/previews.js`: isolated, presentation-only product UI compositions with fictional records; not interactive operational controls or live screenshots.
- `src/data.js`: role descriptions, workflow and FAQ content.
- `src/styles.css`: scoped site styling, responsive layouts and reduced-motion support.
- `public/favicon.svg`: Relay green navigation mark.
- `qa.cjs`: browser checks using the repository's existing dependency-free CDP helper. With the page running and Chrome debugging on port 9222, run `node apps/product-page/qa.cjs`. Screenshots go to ignored `artifacts/`.

## Verified source and claim boundaries

The current source, not historical design documents, informed the page:

| Page content | Current source |
| --- | --- |
| Green palette, warm surfaces, system typography, tilted ⇄ mark and relay. wordmark | `apps/web/src/styles/styles.css`, `apps/web/src/scripts/workspace.js` |
| Dispatch queue, feasibility checks, allocation, deferrals and route outcomes | `apps/web/src/scripts/dispatch.js` |
| Reverse loading, loading issues, stop progression, recipient/carton/time evidence, return visits | `apps/web/src/scripts/field.js` |
| Ordering, delivery tracking, receipt confirmation, discrepancies | `apps/web/src/scripts/store.js` |
| Authenticated sessions and server role checks | `apps/api/src/auth.js` |

UI previews reproduce the presentational language and verified states without importing application scripts or displaying original organization names. All displayed counts and records are illustrative, not customer results. The small route graphic is explicitly schematic. The adoption section describes a process, not automated onboarding or a promised implementation duration.

Intentionally omitted: real offline synchronization, live cross-device tracking, predictive forecasting, optimization claims and managerial analytics (current operational records and these experiences are local simulations). Also omitted: integration logos, public API promises, certifications, SLAs, pricing, customer endorsements and unverified legal pages. Backend role checks do not imply that all operational records are backend-persisted.

No verified sales contact or deployed application URL is configured in the repository. CTAs therefore navigate to working sections of the site. Add a real destination before introducing a demo request form, contact link or sign-in link. No lead data is collected.
