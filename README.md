# Relay

A connected logistics prototype for Colombo-area distribution. Built with semantic HTML, CSS tokens, and vanilla JavaScript; no runtime dependencies or build step.

## Run

```powershell
cd D:\tech_triathlon\designathon-ui
node server.js
```

Open http://localhost:4173. You can also open `index.html` directly, although the local server is recommended.

## Demonstrate the connected journey

1. **Store** → Use recommended quantities → Review order → Place order. This creates **ORD-2847**, 40 cartons for Keells Nugegoda.
2. **Dispatch** → Assign ORD-2847 to **R-07 / TRK-214** → Confirm dispatch → Confirm & release. Other queued orders may also be assigned within vehicle capacity.
3. **Warehouse** → Confirm loaded in the displayed reverse-stop sequence → Complete loading. Try a missing-carton issue and resolve it with a note.
4. **Delivery** → Start route → I've arrived → Verify & confirm delivery. Enter a recipient and verify carton counts for every stop.
5. **Store → Order tracking** shows the same order and delivery receipt. The notification control opens shared activity.

Use **Simulate offline** in Warehouse or Delivery. Actions persist across refreshes and appear in the pending queue. Reconnect clears that queue within the local simulation. Workspace guide includes a confirmed reset action.

Deep links: `/#store`, `/#dispatch`, `/#loader`, `/#delivery`.

## Scope

All operational data, availability, contact information, and synchronization are simulated. Data persists in this browser's localStorage; there is no backend or cross-device synchronization. Navigation opens an external map search. The route schematic is illustrative. One route can be dispatched per demo; orders created after dispatch remain queued until a demo reset. The online font uses Google Fonts with a system fallback.

## Design and capture

Desktop planning uses a queue, stop sequence, and vehicle context. Tablet loading emphasizes sequence and exceptions. Mobile delivery has a persistent primary action above role navigation. All interface text is DOM text. Use a 1440px viewport for desktop captures and 390px for delivery.

Tokens, layout rules, status treatments, focus states, and responsive breakpoints are in `styles.css`. Shared entities and workflow transitions are in `script.js`.

## Verification

The dependency-free browser test uses Node 24's WebSocket support and Chrome DevTools Protocol. With the server running, start a separate headless browser:

```powershell
Start-Process -FilePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList '--headless=new','--disable-gpu','--remote-debugging-port=9222','--user-data-dir=D:\tech_triathlon\designathon-ui\.browser-profile','about:blank' -WindowStyle Hidden
node --test tests/browser.test.js
```

The test covers creation through delivery, loading exceptions, offline persistence after reload, queued synchronization, runtime errors, and page overflow at 390, 768, 1280, and 1440px. It resets demo state afterward. Screenshots are written to ignored `artifacts/`.
