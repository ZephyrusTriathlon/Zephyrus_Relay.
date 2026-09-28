# Relay — Tech-Triathlon 2026 Designathon

Relay is a connected delivery-operations prototype for the fictional Waypoint Group: Order → Plan → Load → Deliver → Confirm receipt. It demonstrates the four official user roles and uses the supplied synthetic network conventions for outlets, vehicles, depots, access, temperature, capacity and delivery windows.

Open **Design case study** in the prototype for the four personas, screen rationales, named degradation scenario, scope and tradeoff explanation, style guide, and AI tool disclosure.

## Run

```powershell
cd "C:\BACKUP 4TB\Tech-Triathlon\tech-triathlon-designathon-ui"
node server.js
```

Open **http://localhost:4173**. `npm start` runs the same server. Role deep links are `/#store`, `/#dispatch`, `/#loader` and `/#delivery`.

## A complete judging walkthrough

1. **Store:** choose **Use recommended quantities**, adjust cartons with the steppers, and **Review order → Place order**. The replenishment creates **ORD-2847** for **Waypoint Fresh · OUT006**, shows the official 16:00 cutoff, and carries weight, volume and temperature needs into planning.
2. **Dispatch:** assign **ORD-2847** to **R-07 / Fresh / Colombo**, review all seven feasibility groups (weight, volume, temperature, outlet access, fuel quota, trips & time, delivery windows), then **Confirm plan → Confirm & release**. The default vehicle is the supplied-fleet-aligned **VEH003** reefer truck. Try the van-only OUT001 order to see access validation, record a reasoned deferral, or open the 10-week capacity outlook.
3. **Warehouse:** load the last delivery stop first, following the numbered manifest. Expand a shipment to check its products. Try **Missing / issue**, select a problem, then resolve it with a note. **Confirm loaded** advances the sequence; **Complete loading** becomes available once every shipment is checked.
4. **Delivery:** **Start route**, navigate or open the sample contact details, record arrival, then verify the delivery. A receipt requires the full carton count, the verification checkbox, a recipient and delivery time. Simulate lost connectivity to see the named degradation and recovery state.
5. **Store → Order tracking:** the same order shows the Dispatch-calculated **Expected arrival**, delivery window, route and vehicle, then the Driver POD after delivery. Open **View receipt**, check the cartons and choose **Confirm receipt**; only then do received cartons update stock and replenishment suggestions.
6. **Store → Dispatch issue path:** on a delivered OUT006 order choose **Report an issue**, select a type and enter useful details. Return to **Dispatch → Route** to see the completed delivery and separate Store receipt follow-up. The activity control records the shared handoffs.

The sidebar or mobile bottom navigation switches demo personas at any point. **Demo guide** explains the journey and offers a confirmed reset. Reset affects Relay’s local data only.

## Useful states to demonstrate

- **Delivery exceptions:** report Store closed, Recipient unavailable, Damaged goods, Partial delivery, Delivery refused or Access delayed. **Save & return later** holds the order open and advances to another stop. Outstanding stops remain visible; a return visit requires a resolution note and a new arrival. A route with deferred stops is never reported as complete.
- **Named degradation — Connection lost during delivery:** use the connectivity control in Warehouse or Delivery, or launch it from the Design case study. The live example uses the Colombo route; coverage loss is especially relevant in hill country, along the Kandy corridor and in rural districts. Loading, issue resolutions and receipts persist through refresh, with last-sync and pending-update feedback. Reconnecting reconciles the simulated queue. Dispatch route changes are unavailable while offline.
- **Planning constraints:** weight, volume, refrigeration, van-only access, depot, fuel quota, trip limit and Fresh’s pre-dawn time budget are visible. Incompatible vehicles and assignments are blocked with an explanation.
- **Explainable deferral:** select an unassigned order, choose **Defer**, record the reason and impact, and see the decision shared with the store.
- **Validation and empty states:** clear search results, try an empty order, exceed vehicle capacity, leave resolution details blank, or enter an incorrect proof-of-delivery count. Each state explains the next useful action.
- **Responsive planning:** desktop exposes queue, route and vehicle together. Tablet and mobile use **Orders / Route / Vehicle** tabs; arrow keys, Home and End also navigate the tabs.

## Design and capture

The four workspaces share warm neutral surfaces, deep green actions, restrained status colors, readable operational type and a compact order lifecycle. Mobile Store uses product rows recomposed as touch-friendly cards and an order summary above navigation. Warehouse prioritizes loading sequence on tablets. Delivery uses a single next-stop view, an optional route overview and a primary action above the safe-area-aware navigation. Toasts occupy a separate space above the action bar.

Interface content is real DOM text, grouped using Grid and Flexbox. Small route and vehicle illustrations use SVG; the application itself is not a flattened image or canvas. Shared tokens and patterns live in `styles.css`; persona styling is in `dispatch.css`, `store.css`, `field.css` and `case-study.css`. `script.js` and `workspace.js` manage the shared state and shell; the corresponding view JavaScript files contain their screens and interactions. The system-font stack keeps the prototype self-contained.

Dialogs have accessible names, keyboard focus containment and focus restoration. Controls provide visible focus, labeled inputs and status text. Touch targets are enlarged in the field interfaces and reduced-motion preferences are respected.

## Prototype boundaries

All operational records, stock cover, availability, suggestions, routes, ETAs, contacts, forecast values and synchronization are simulated. The prototype uses official field names and representative records, but it does not load the confidential CSV files into the browser. Data persists in this browser’s `relay-v1` localStorage entry; there is no backend or cross-device synchronization. Offline mode demonstrates the experience, not an actual service worker.

One **R-07** Fresh trip is editable and can be released during each demo. **R-12 Style** and **R-15 Tech** are scope previews. Fleet selection uses three representative available vehicles from the supplied Peliyagoda fleet. Suggestions, forecast values, time budgets and schematic maps illustrate decisions; they do not claim optimization or Datathon predictions. New orders placed after release remain queued until a demo reset. Navigation opens an external map search. Partial deliveries remain outstanding for reconciliation; they do not generate a completed receipt.

## Verification

With Node 24, the local server running and a separate Chrome debugging browser, run:

```powershell
Start-Process -FilePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList '--headless=new','--disable-gpu','--remote-debugging-port=9222','--user-data-dir=C:\BACKUP 4TB\Tech-Triathlon\tech-triathlon-designathon-ui\.browser-qa','--no-first-run','about:blank' -WindowStyle Hidden
node --test tests/browser.test.js
```

The dependency-free test opens its own browser tab and restores the previous Relay data afterward. It never clears unrelated localStorage. Optional `RELAY_URL` and `RELAY_CDP_URL` environment variables override the server and debugging endpoints.

Coverage includes the same order across all four roles; search and filters; quantity bounds and steppers; dialog keyboard behavior; mobile planning tabs; vehicle selection and capacity rejection; reverse loading; issue resolution; offline reload; deferred delivery stops and return visits; receipt validation; Store delivery confirmation; runtime errors; and layout overflow across **360, 390, 430, 768, 834, 1024, 1280 and 1440px**. Active Delivery checks verify that navigation, primary actions and toast messages do not overlap at 360–430px.

Full-page screenshots are written to ignored `artifacts/`, including Store 1440/430/390, Dispatch 1440/1024/390, Warehouse 834/768 and Delivery 430/390/360. Additional captures show planning tabs, delivery exceptions and completed receipts. Mobile `-viewport` images preserve the actual visible screen for checking fixed controls.
