# Relay Project Guide

This guide explains the project for a reader who is new to the competition, frontend development, and this codebase.

## 1. Project Overview

### What this project is

Relay is an interactive website prototype created for the Tech-Triathlon 2026 Designathon. It shows how Waypoint Group could coordinate a delivery from the moment a store places an order until the store confirms receipt.

Waypoint Group is fictional. It has three retail brands:

- Waypoint Fresh sells groceries, including chilled and frozen goods.
- Waypoint Style sells garments and cartons, often through malls with fixed access times.
- Waypoint Tech sells heavy, fragile, high-value appliances and electronics.

All three brands share one delivery network. The supplied competition data describes 120 outlets, 60 vehicles, a distribution centre in Peliyagoda, and a regional hub in Kandy. The data is synthetic and does not represent real companies or people.

### What problem it solves

Waypoint currently depends on spreadsheets, phone calls, printed run sheets, and handwritten notes. This creates several problems:

- Orders may be entered more than once.
- Plans depend on one dispatcher’s knowledge.
- Loaders may work from an outdated list.
- Drivers and dispatchers do not share a live view of progress.
- Delivery problems and deferrals are difficult to explain later.
- Proof of delivery may depend on memory or paper.
- Mobile coverage may disappear while a driver is working.
- Future demand is difficult to turn into fleet and staffing decisions.

Relay creates one connected record across ordering, planning, loading, delivery, and receipt.

### How it relates to the Designathon

The Designathon asks teams to design one system for four roles: dispatcher, loader, driver, and store manager. The final design must connect the role-specific experiences, include one persona per role, explain every screen, and fully design at least one failure or “degradation” scenario.

Relay provides:

- A Store workspace for ordering and tracking.
- A Dispatch workspace for allocation and explainable deferral.
- A Warehouse workspace for reverse-sequence loading and shortfall reporting.
- A Delivery workspace for phone-sized route work and proof of delivery.
- A Design case study with personas, rationale, scope, tradeoff, style guidance, and AI disclosure.
- A named degradation scenario: **Connection lost in hill country**.

## 2. Competition Requirement Explanation

### What the challenge expects

The official challenge expects a high-fidelity prototype that lets judges understand a complete delivery workflow. It is not enough to draw four unrelated dashboards. A dispatcher’s released plan must become the loader’s manifest. The driver’s delivery record must become information the store manager and dispatcher can use.

The official Designathon judging criteria are:

| Criterion | Weight |
| --- | ---: |
| Problem framing | 25% |
| Understanding of user context | 20% |
| Degradation screen quality | 15% |
| Domain accuracy | 10% |
| Scope and prioritization | 15% |
| Visual and interaction design across roles | 15% |

### The four user roles

#### Dispatcher

The dispatcher works on a large screen with stable connectivity. They close the confirmed order queue, assign served orders to vehicles and trips, check operating constraints, identify deferred orders, and explain why an outlet was skipped. They also need delivery progress and future capacity information.

Relay gives the dispatcher:

- A confirmed order queue.
- A stop sequence.
- A selected vehicle and driver.
- Weight and volume checks.
- Chilled/reefer compatibility.
- Van-only outlet access checks.
- Depot, fuel, trip-count, and time-budget checks.
- A reasoned deferral form.
- A 10-week capacity outlook.
- Delivery progress, receipts, and exception visibility.

#### Loader

The loader works at the Peliyagoda or Kandy dock on a shared tablet or terminal. They need the final stop sequence so that the last delivery is loaded deepest and the first delivery is nearest the door. They also need to report missing, damaged, or mismatched goods before departure.

Relay gives the loader:

- The released vehicle, trip, bay, driver, and temperature class.
- Reverse loading order.
- Product and carton checklists.
- A controlled “Confirm loaded” sequence.
- Issue reporting and resolution notes.
- Offline saving and synchronization feedback.

#### Driver

The driver uses a personal phone and should interact only while safely stopped. The driver needs one clear next stop, navigation and contact actions, delivery-window information, exception reporting, and proof of delivery. Work must continue without network coverage.

Relay gives the driver:

- A phone-first current-stop view.
- Route progress and an optional overview.
- Arrival recording.
- Delivery exceptions and return visits.
- Carton verification, recipient name, and delivery time.
- Local offline persistence and a visible synchronization queue.

#### Store manager

The store manager works at the outlet counter on a desktop or phone. They need to place an order before the 16:00 cutoff, know whether it was accepted and scheduled, prepare staff for arrival, understand a deferral, confirm receipt, and report or view issues.

Relay gives the store manager:

- Stock health and suggested full-carton quantities.
- The 16:00 cutoff and next-day Fresh window.
- Order confirmation and tracking.
- Vehicle and route details after allocation.
- Deferral and exception explanations.
- A completed proof-of-delivery receipt.

### The represented workflow

1. A store manager places and confirms an order before 16:00.
2. The dispatcher receives the order in one confirmed queue.
3. The dispatcher assigns served orders to a feasible vehicle and trip.
4. The dispatcher records a reason for every deferred order.
5. The loader receives the released stop sequence and loads it in reverse.
6. The driver follows the route and records each stop, even when offline.
7. The store manager sees the delivery outcome and receipt.
8. The dispatcher can use an illustrative 10-week outlook to discuss vehicles, drivers, and refrigerated capacity.

### Why the screens exist

The Store screen reduces uncertain phone/message ordering. The Dispatch screen makes constraints and decisions visible. The Warehouse screen prevents a loading list from becoming disconnected from the plan. The Delivery screen creates reliable progress and proof. The Design case study makes the reasoning behind the screens explicit for judges.

## 3. Where To Start

### First file to open

Open `index.html` first. It is the browser entry point. It links every stylesheet and JavaScript file in the correct order.

Do not expect `index.html` to contain every visible card and button. This application builds most of its page content with JavaScript. The browser starts with an empty `<div id="app"></div>`, and `workspace.js` fills that container.

### File that controls the main UI

`workspace.js` controls the shared application shell:

- Left sidebar or mobile bottom navigation.
- Top bar.
- Active user role.
- Main content area.
- Shared dialogs.
- Offline banner.

`script.js` controls shared data and actions. The role files control the details of each screen.

### How the application starts

1. `server.js` starts a very small local web server on port 4173.
2. The browser requests `index.html`.
3. `index.html` loads CSS files.
4. `index.html` loads JavaScript files in dependency order.
5. `script.js` creates or restores the shared demo state from `localStorage`.
6. `render()` in `workspace.js` builds the current screen inside `#app`.

### How files connect

```text
server.js
  └─ serves index.html
       ├─ loads styles.css, dispatch.css, store.css, field.css, case-study.css
       └─ loads workspace.js, dispatch.js, store.js, field.js, case-study.js, script.js
            ├─ script.js owns shared data and event routing
            ├─ workspace.js renders the common shell
            ├─ dispatch.js renders planning
            ├─ store.js renders store ordering/tracking
            ├─ field.js renders loading and delivery
            └─ case-study.js renders Designathon evidence
```

## 4. Folder Structure Explanation

### Root files

There is no separate `components/` folder. Reusable prototype components are plain JavaScript functions such as `badge()`, `lifecycle()`, `flow()`, `heading()`, and `dialogFooter()`. There is also no separate `assets/` folder: icons and the simple route illustrations are inline SVG, so the prototype stays self-contained. Configuration is intentionally small and lives in `package.json`, `.gitignore`, and the constants near the top of the JavaScript files.

#### `index.html`

Purpose: The browser entry page.

How it connects: It loads all CSS and JavaScript files and provides the empty containers that JavaScript fills.

#### `styles.css`

Purpose: Shared design tokens and reusable styles. It defines colors, typography, buttons, navigation, dialogs, badges, focus states, the role workflow strip, and responsive shell behavior.

How it connects: Every screen uses these classes. Role-specific CSS builds on this shared foundation.

#### `dispatch.css`

Purpose: Styles the dispatcher’s large-screen planning workspace, queue cards, route, vehicle panel, feasibility checks, and responsive planning tabs.

How it connects: It styles HTML strings created by `dispatch.js`.

#### `store.css`

Purpose: Styles inventory rows, product search and filters, quantity steppers, order summary, tracking cards, and the store’s mobile layout.

How it connects: It styles HTML strings created by `store.js`.

#### `field.css`

Purpose: Styles the warehouse tablet experience and driver phone experience, including loading cards, route progress, fixed mobile actions, proof forms, exceptions, and return visits.

How it connects: It styles HTML strings created by `field.js`.

#### `case-study.css`

Purpose: Styles the Designathon evidence page: problem framing, personas, screen rationale, degradation scenario, decisions, style guide, and disclosure.

How it connects: It styles HTML strings created by `case-study.js`.

#### `script.js`

Purpose: Owns shared products, seeded orders, role definitions, browser state, persistence, global events, toasts, and common dialog actions.

How it connects: Every view reads the same `state` object. When one role changes an order, the other role screens immediately render the new state.

#### `workspace.js`

Purpose: Provides reusable display helpers and the application shell.

Important functions:

- `badge()` creates status labels.
- `lifecycle()` creates the order progress strip.
- `flow()` creates the connected four-step journey.
- `offlineBanner()` explains the degradation state.
- `render()` selects and draws the current screen.
- `openDialog()` and `closeDialog()` manage accessible modal windows.

#### `dispatch.js`

Purpose: Implements dispatcher data, screens, constraints, allocation, deferral, fleet selection, manifest review, and future capacity planning.

Important functions:

- `vehicleBlockers()` returns reasons a vehicle/plan is infeasible.
- `planChecks()` supplies visible constraint results.
- `dispatchView()` builds the main dispatcher screen.
- `queueCards()` builds the unassigned/deferred order cards.
- `vehicleContext()` builds the vehicle panel.
- `handleDispatchAction()` processes dispatcher interactions.

#### `store.js`

Purpose: Implements stock display, product filtering, suggested quantities, order review, placement, tracking, and receipt visibility.

How it connects: New store orders are added to shared state and immediately appear in `dispatch.js`. Completed driver receipts return to the Store tracking screen.

#### `field.js`

Purpose: Implements both field roles because loading and delivery share the same released manifest.

How it connects: It reads the route created in `dispatch.js`. Loader actions prepare the driver state. Driver actions update Store and Dispatch.

#### `case-study.js`

Purpose: Implements the required design explanation inside the prototype.

How it connects: Buttons open each live role screen. The degradation button creates a prepared offline driver state so a judge can test the failure scenario.

#### `server.js`

Purpose: Serves local files over HTTP without external dependencies or a build step.

How it connects: `npm start` runs this file.

#### `package.json`

Purpose: Provides project metadata and two commands:

- `npm start` runs `server.js`.
- `npm test` runs the browser test file.

There are no runtime dependencies.

#### `README.md`

Purpose: Gives an experienced evaluator a quick setup, judge walkthrough, useful states, prototype boundaries, and test instructions.

How it connects: It is the short operational handoff. This guide is the longer beginner explanation.

#### `.gitignore`

Purpose: Prevents generated browser profiles, screenshots, test results, and dependencies from being committed accidentally.

### `tests/`

#### `tests/browser.test.js`

Purpose: Exercises the connected journey, constraints, search/filter behavior, dialogs, exceptions, offline reload, receipts, responsive layouts, and accessibility expectations.

How it connects: It drives the running website through Chrome’s debugging protocol.

#### `tests/cdp.js`

Purpose: A small dependency-free helper for communicating with Chrome DevTools.

How it connects: `browser.test.js` uses it for navigation, clicking, typing, screenshots, viewport changes, and browser error collection.

### Generated folders

#### `artifacts/`

Purpose: Contains screenshots created by the browser tests for visual review.

How it connects: It is ignored by Git and can be regenerated.

#### `.browser-qa/`

Purpose: A temporary Chrome profile used only during automated testing.

How it connects: It is ignored by Git and is not part of the submission design.

## 5. Detailed `index.html` Explanation

HTML describes the structure of a web page. An HTML “element” normally has an opening tag, content, and a closing tag. For example, `<title>Relay</title>` tells the browser what title to show for the tab.

### `<!doctype html>`

This tells the browser to use modern HTML rules.

### `<html lang="en">`

This wraps the whole document and tells assistive technology that the page language is English.

### `<head>`

The head contains information about the page rather than visible application content.

- `charset="UTF-8"` allows normal Unicode text.
- `viewport` makes the layout match phone and tablet screens.
- `theme-color` supplies a green browser theme color on supported devices.
- `description` explains the prototype to browsers and link previews.
- `title` names the browser tab.
- The five `<link rel="stylesheet">` elements load shared and screen-specific CSS.

The stylesheet order matters. `styles.css` provides the shared base first. The other files add more specific layouts afterward.

### `<body>`

The body contains everything the user can interact with.

#### Skip link

`<a class="skip" href="#main">Skip to workspace</a>` lets keyboard and screen-reader users jump past repeated navigation.

#### Application container

`<div id="app"></div>` is an initially empty container. `render()` in `workspace.js` fills it with the sidebar, top bar, and current screen.

#### Toast status

`<div id="toast" role="status" aria-live="polite"></div>` displays short success or error messages. `aria-live="polite"` asks a screen reader to announce updated text without interrupting the current sentence.

#### Dialog

`<dialog id="dialog"></dialog>` is the shared modal window used for order review, fleet choice, issue forms, receipts, deferrals, and other focused tasks.

#### Script files

The `<script>` elements load JavaScript in order:

1. `workspace.js` defines shared rendering helpers.
2. `dispatch.js` defines dispatcher functions.
3. `store.js` defines store functions.
4. `field.js` defines loader and driver functions.
5. `case-study.js` defines the Designathon evidence view.
6. `script.js` defines shared state and events, then calls `render()`.

Scripts share the same browser page, so functions defined by an earlier script can be used by a later one.

## 6. User Journey Guide

### If I open this application as a judge, what happens?

The default URL opens Dispatch. For the intended narrative, click **Design case study** first, then **Start judge walkthrough**.

### Step 1: Understand the design

Read the problem framing, four personas, screen rationales, degradation scenario, scope decision, tradeoff, style guide, and AI disclosure. This explains why the prototype focuses on one complete Fresh trip while still representing Style and Tech constraints.

### Step 2: Place an order as the store manager

1. Open **Store**.
2. Review stock health and the 16:00 cutoff.
3. Click **Use recommended quantities**.
4. Adjust a carton count if desired.
5. Click **Review order**.
6. Check products, temperature, weight, volume, and requested window.
7. Click **Place order**.
8. Continue to Dispatch.

### Step 3: Plan as the dispatcher

1. Find the new order at the top of the queue.
2. Review its outlet, temperature, access, weight, volume, window, and time since last service.
3. Assign it to R-07.
4. Read the six visible constraint checks.
5. Open **Change** to compare compatible and incompatible vehicles.
6. Optionally select OUT001 to see a van-only access blocker.
7. Optionally choose **Defer** on a queue order and record the reason and impact.
8. Open **Capacity outlook** to see future fleet/reefer planning.
9. Click **Confirm plan**, review feasibility, then **Confirm & release**.

### Step 4: Load as the loader

1. Open **Warehouse**.
2. Notice the final stop is first in the loading sequence.
3. Expand the item checklist.
4. Optionally report a missing, damaged, or mismatched shipment.
5. Add a resolution note.
6. Confirm each shipment loaded.
7. Complete loading.

### Step 5: Deliver as the driver

1. Open **Delivery** on a phone-sized screen if possible.
2. Start the route.
3. View the current stop and delivery window.
4. Record arrival.
5. Verify all cartons, enter the recipient name and time, then confirm delivery.
6. Repeat for remaining stops.

### Step 6: Test the degradation scenario

1. Return to **Design case study**.
2. Find **Connection lost in hill country**.
3. Click **Open the live failure state**.
4. The driver screen opens offline with three queued updates.
5. Record field work and refresh the page; state remains in browser storage.
6. Reconnect; the queued updates reconcile in the simulation.

### Step 7: Confirm the connected result

Return to Store and open Order tracking. The same order now contains the driver’s recipient, carton verification, and delivery time. Dispatch also shows the completed route and receipts.

## 7. Developer Guide

### Requirements

- Node.js installed.
- A modern browser.
- No `npm install` is required because the application has no runtime packages.

### Run the project

In PowerShell:

```powershell
cd "C:\BACKUP 4TB\Tech-Triathlon\tech-triathlon-designathon-ui"
node server.js
```

Then open:

```text
http://127.0.0.1:4173
```

Useful direct links:

- `/#case-study`
- `/#store`
- `/#dispatch`
- `/#loader`
- `/#delivery`

### Modify a screen

- Store screen markup and behavior: `store.js`.
- Dispatch screen markup and behavior: `dispatch.js`.
- Loader and driver screen markup and behavior: `field.js`.
- Designathon explanation: `case-study.js`.
- Shared shell and dialogs: `workspace.js`.

Most visible HTML is written inside JavaScript template strings surrounded by backticks. Edit carefully: an unmatched backtick, `${...}` expression, or closing tag can stop the script.

### Modify styles

- Shared colors, typography, navigation, buttons, dialog and breakpoints: `styles.css`.
- Dispatch-only layout: `dispatch.css`.
- Store-only layout: `store.css`.
- Warehouse and driver layouts: `field.css`.
- Case-study layout: `case-study.css`.

Reuse existing CSS variables such as `--accent`, `--line`, `--muted`, and `--amber-bg` instead of creating slightly different colors.

### Modify shared data

Seed products, orders, role names, and shared browser state are in `script.js`.

Important rule: an order should keep these domain fields when it moves through the system:

- `outletId`
- `brand`
- `district`
- `depot`
- `dockType`
- `parkingConstraint`
- `tempRequirement`
- `weight`
- `volume`
- `window`
- `deferredYesterday`
- `daysSinceLastServed`

### Add a new feature

1. Decide which role owns the action.
2. Add display markup to that role’s view function.
3. Add a `data-action="your-action"` attribute to the control.
4. Handle the action in the role’s `handle...Action()` function or the shared switch in `script.js`.
5. Update shared `state` only when other roles need the result.
6. Call `record()` for an activity that should appear in the shared log or offline queue.
7. Call `render()` after a state change.
8. Add styles in the narrowest relevant CSS file.
9. Add or update a browser test.

### Reset the demo

Open **Design case study** and choose **Reset demo**, or run this in the browser console:

```javascript
state = seed();
save();
render();
```

The application stores only one key: `relay-v1`.

### Run verification

The full automated test needs a Chrome instance with debugging enabled. The README includes the Windows command. Once Chrome and the local server are running:

```powershell
node --test tests/browser.test.js
```

The test checks the connected order, planning constraints, loading order, exceptions, offline reload, proof validation, Designathon evidence, accessibility behavior, browser errors, and widths from 360 to 1440 pixels.

## 8. Final Submission Explanation

### How this implementation satisfies the challenge

#### Problem framing

The Design case study states the fragmented planning, delivery visibility, deferral, communication, demand, timing, and connectivity problems. The prototype demonstrates one shared record instead of four disconnected tools.

#### User context

Each role has a persona and device-appropriate interface:

- Large multi-panel dispatcher workspace.
- Tablet-friendly loader sequence.
- Phone-first driver task flow.
- Desktop/phone store ordering and tracking.

#### Degradation quality

The named **Connection lost in hill country** scenario includes:

- Clear offline state.
- Last synchronization time.
- Pending-update count.
- Continued safe field work.
- Protected route changes.
- Refresh persistence.
- Reconciliation on reconnect.
- No false completion while stops are outstanding.

#### Domain accuracy

The prototype represents:

- Waypoint Fresh, Style, and Tech.
- Peliyagoda and Kandy network context.
- Official-style outlet and vehicle IDs.
- Weight and volume limits.
- Chilled/reefer rules.
- Van-only access.
- Brand and district grouping.
- Vehicle home depot.
- Weekly fuel quota.
- Maximum two trips.
- Fresh’s 270-minute pre-dawn budget.
- Delivery windows and the 16:00 order cutoff.
- Deferral reason and repeat-skip protection.
- Depot/brand/week future capacity planning.

#### Scope and prioritization

The high-fidelity slice follows one Waypoint Fresh Colombo trip across all four roles. This is intentional: Fresh combines strict morning windows and refrigerated capacity, producing the strongest test of the connected workflow. Style and Tech remain visible as supported planning contexts without adding repetitive screens.

#### Visual and interaction consistency

All roles reuse the same status language, order lifecycle, colors, spacing, controls, dialogs, and activity record. The layout changes for the user’s device and work context without looking like a different product.

### Main design decisions

- Assisted, explainable allocation instead of invisible automatic optimization.
- One shared state across roles.
- Constraint checks next to the plan, not hidden after confirmation.
- Reverse loading derived from the route.
- One next action on the driver screen.
- Offline field work with visible recovery state.
- Deferred stops remain open until reconciled.
- Self-contained system fonts and no runtime dependencies.

### Important submission notes

The official Designathon submission still requires work outside this repository:

- Export the final design file using `TeamName_Designathon` as the base filename.
- Compress it as `TeamName_Designathon.zip`.
- Provide a shareable prototype link.
- Record a three-to-five-minute unlisted YouTube demo.
- Submit before Tuesday, September 29, 2026 at 11:59 PM Sri Lanka time.

Replace the team-name placeholder, review the AI disclosure so it exactly matches the team’s process, and keep the deployed prototype available for judging.
