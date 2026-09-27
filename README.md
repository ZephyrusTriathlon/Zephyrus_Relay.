# Relay

A connected distribution prototype for Colombo-area replenishment: Store → Plan → Load → Deliver → Complete. Built with semantic HTML, CSS and vanilla JavaScript. No runtime dependencies, build step, authentication or backend.

## Run

```powershell
cd D:\tech_triathlon\designathon-ui
node server.js
```

Open **http://localhost:4173**. `npm start` runs the same server. Role deep links are `/#store`, `/#dispatch`, `/#loader` and `/#delivery`.

## A complete judging walkthrough

1. **Store:** choose **Use recommended quantities**, adjust cartons with the steppers, and **Review order → Place order**. The first replenishment creates **ORD-2847**, 40 cartons / 280 kg for **Keells · Nugegoda**. Search by product or SKU, or filter by stock health.
2. **Dispatch:** assign **ORD-2847** to **R-07 / Colombo East**, review its delivery window and capacity, then **Confirm plan → Confirm & release**. The default vehicle is **TRK-214**, driven by **Amal Perera**. **Change** opens the fleet selector; the chosen vehicle, driver and bay follow the order into the warehouse and field interfaces. Orders that exceed capacity remain unassigned with an explanation.
3. **Warehouse:** load the last delivery stop first, following the numbered manifest. Expand a shipment to check its products. Try **Missing / issue**, select a problem, then resolve it with a note. **Confirm loaded** advances the sequence; **Complete loading** becomes available once every shipment is checked.
4. **Delivery:** **Start route**, navigate or open the sample contact details, record arrival, then verify the delivery. A receipt requires the full carton count, the verification checkbox, a recipient and delivery time. Confirm each stop to complete the route.
5. **Store → Order tracking:** the same order now shows **Delivered**, its recipient, verified cartons and delivery time. Received cartons update the store stock position and replenishment suggestions. The activity control records the shared handoffs.

The sidebar or mobile bottom navigation switches demo personas at any point. **Demo guide** explains the journey and offers a confirmed reset. Reset affects Relay’s local data only.

## Useful states to demonstrate

- **Delivery exceptions:** report Store closed, Recipient unavailable, Damaged goods, Partial delivery, Delivery refused or Access delayed. **Save & return later** holds the order open and advances to another stop. Outstanding stops remain visible; a return visit requires a resolution note and a new arrival. A route with deferred stops is never reported as complete.
- **Offline simulation:** use the connectivity control in Warehouse or Delivery. Loading, issue resolutions and receipts persist through refresh, with last-sync and pending-update feedback. Reconnecting clears the simulated queue. Dispatch planning is unavailable while this simulation is active.
- **Validation and empty states:** clear search results, try an empty order, exceed vehicle capacity, leave resolution details blank, or enter an incorrect proof-of-delivery count. Each state explains the next useful action.
- **Responsive planning:** desktop exposes queue, route and vehicle together. Tablet and mobile use **Orders / Route / Vehicle** tabs; arrow keys, Home and End also navigate the tabs.

## Design and capture

The four workspaces share warm neutral surfaces, deep green actions, restrained status colors, readable operational type and a compact order lifecycle. Mobile Store uses product rows recomposed as touch-friendly cards and an order summary above navigation. Warehouse prioritizes loading sequence on tablets. Delivery uses a single next-stop view, an optional route overview and a primary action above the safe-area-aware navigation. Toasts occupy a separate space above the action bar.

Interface content is real DOM text, grouped using Grid and Flexbox. Small route and vehicle illustrations use SVG; the application itself is not a flattened image or canvas. Shared tokens and patterns live in `styles.css`; persona styling is in `dispatch.css`, `store.css` and `field.css`. `script.js` and `workspace.js` manage the shared state and shell; the corresponding persona JavaScript files contain their views and interactions. This structure supports later Figma capture and component reconstruction.

Dialogs have accessible names, keyboard focus containment and focus restoration. Controls provide visible focus, labeled inputs and status text. Touch targets are enlarged in the field interfaces and reduced-motion preferences are respected.

## Prototype boundaries

All operational records, stock cover, availability, suggested quantities, routes, ETAs, contact details and synchronization are simulated. Data persists in this browser’s `relay-v1` localStorage entry; there is no server data or cross-device synchronization. Offline mode demonstrates the experience, not an actual network cache or service worker.

One **R-07** route is editable and can be released during each demo. **R-12** and **R-15** are scheduled-run previews. Fleet selection offers three realistic mock vehicles. Suggestions and schematic maps illustrate planning decisions; they do not optimize routes. New orders placed after release remain queued until a demo reset. Navigation opens an external map search. Partial deliveries remain outstanding for reconciliation; they do not generate a completed receipt. Google Fonts has a system-font fallback.

## Verification

With Node 24, the local server running and a separate Chrome debugging browser, run:

```powershell
Start-Process -FilePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList '--headless=new','--disable-gpu','--remote-debugging-port=9222','--user-data-dir=D:\tech_triathlon\designathon-ui\.browser-qa','--no-first-run','about:blank' -WindowStyle Hidden
node --test tests/browser.test.js
```

The dependency-free test opens its own browser tab and restores the previous Relay data afterward. It never clears unrelated localStorage. Optional `RELAY_URL` and `RELAY_CDP_URL` environment variables override the server and debugging endpoints.

Coverage includes the same order across all four roles; search and filters; quantity bounds and steppers; dialog keyboard behavior; mobile planning tabs; vehicle selection and capacity rejection; reverse loading; issue resolution; offline reload; deferred delivery stops and return visits; receipt validation; Store delivery confirmation; runtime errors; and layout overflow across **360, 390, 430, 768, 834, 1024, 1280 and 1440px**. Active Delivery checks verify that navigation, primary actions and toast messages do not overlap at 360–430px.

Full-page screenshots are written to ignored `artifacts/`, including Store 1440/430/390, Dispatch 1440/1024/390, Warehouse 834/768 and Delivery 430/390/360. Additional captures show planning tabs, delivery exceptions and completed receipts. Mobile `-viewport` images preserve the actual visible screen for checking fixed controls.
