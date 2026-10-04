# Final judge walkthrough

Use the root README Docker or local built-app setup on a fresh database. The default exact supplied network is documented in `prisma/judge-data/README.md`. Every login below uses password **RelayDemo!26**. This intentionally starts with historical seeded orders so judging does not depend on today's date falling inside the reference calendar. Explicit judge mode fixes only the ordering business clock at 2025-01-01 15:00 Colombo, with a small date note beside Store ordering. Security/session and delivery/POD audit timestamps use actual time. The root README also includes new-order and deferred carry-forward steps.

Main record: **TRIP-2025-01-02-01**, ID `demo-trip-01`, **VEH001**, Peliyagoda, Driver `driver@relay.demo`. Stop 1 **OUT004** has CHILLED (12 cartons) and AMBIENT (8); stop 2 **OUT005** has SECOND-STOP (10). All order numbers begin `ORD-2025-01-02-`. The Store account owns OUT004 only. The capacity order has 554 cartons in the bundled network and remains deferred.

1. Run `docker compose up` from the configured root and wait for `docker compose ps` to show a healthy app. Open **http://localhost:3001** in Chrome. Use this same origin throughout.
2. Log in as **store@relay.demo**. Expect the OUT004 Store workspace, not an account picker.
3. Open **Order tracking**. Inspect **ORD-2025-01-02-CHILLED** and **ORD-2025-01-02-AMBIENT**, initially Scheduled (database PLANNED), and the capacity deferral. Replenishment supports new orders under the disclosed judge clock. To keep this main-route walkthrough isolated, request January 3 for any new basket and complete it as a second run afterward.
4. Choose **Account → Sign out**.
5. Log in as **dispatcher@relay.demo**.
6. Enter **2025-01-02** in **Planning date · Colombo** and click **Load day**. Expect five orders and the saved DRAFT trip above.
7. Select the unallocated **ORD-2025-01-02-VAN-ONLY** order, choose **VEH001**, leave candidate departure at **04:00**, and click **Validate selected candidate** (on a phone, select Orders, then Vehicle, then Route using the planning tabs). Expect the van-access rejection explanation; nothing is allocated by this check.
8. Check **Retry deferred orders** and click **Allocate orders**. The supplied network allocates the van-only order to **VEH037**, while the 554-carton capacity order stays deferred with a persisted capacity explanation. This extra van trip is outside the main delivery route. Select this additional draft, open Review / adjust draft, choose the seeded Driver and save. Every draft needs an active Driver before Confirm plan is enabled. Driver availability is not an allocation constraint.
9. Expand the capacity order's deferral history. Click **Load day** again and confirm the explanation survives refresh.
10. On **TRIP-2025-01-02-01**, click **Review / adjust draft**. Keep VEH001 and change departure from **04:45** to **04:46**. Click **Validate & save adjustment**. Expect a saved feasible review and recalculated metrics.
11. Click **Confirm plan**. Expect RELEASED on the main and additional van trip; release is atomic. Orders remain PLANNED until Driver start under the existing lifecycle semantics.
12. Choose **Account → Sign out**.
13. Log in as **loader@relay.demo** and select **TRIP-2025-01-02-01** in the Trip selector. Do not select the additional allocated trip.
14. Inspect the manifest: OUT005 loads before OUT004, reversing delivery stop order. Expand the shipment items and check the displayed counts.
15. On the OUT005 shipment, click **Confirm loaded** for its 10 cartons. Expect a persisted check and LOADING trip status.
16. On OUT004, use **Confirm loaded** for both allocations, 8 and 12 cartons, in the displayed sequence. Each allocation requires its own check. For an optional issue demonstration before confirming an allocation, use its issue control, save a missing-carton count/detail, reload, resolve with a note, then confirm the rechecked full count.
17. Click **Complete loading** after all checks. Expect READY and **Vehicle ready. Team in sync.** Refresh to verify persistence.
18. Choose **Account → Sign out**.
19. Log in as **driver@relay.demo**, select **TRIP-2025-01-02-01**, and wait for **Trip saved for offline use.** The assigned additional trip can also appear; select the named main trip.
20. Click **Start route** online. Expect IN_PROGRESS, with OUT004 next. Start is server-validated and requires READY.
21. Click **I've arrived** at OUT004. Its two orders share one physical arrival.
22. Click **Verify & confirm delivery** for the first displayed OUT004 order. Keep its expected carton count, enter recipient **Sahan Jayawardena**, enter the current Colombo delivery time if not prefilled, tick verification and click **Confirm delivery**. Repeat for the other OUT004 order (8 or 12 cartons as displayed). Both real PODs should persist; OUT005 becomes next.
23. Open Chrome DevTools → Network → throttling dropdown → **Offline**. This is the exact Stage 8 real-network demonstration; do not enable developer simulation controls.
24. Reload. Expect the cached Driver route and **Offline** status; the next stop is OUT005. A previously activated Service Worker and authorized cached trip are required.
25. Click **I've arrived** at OUT005. Expect a pending action. Click **Verify & confirm delivery**, keep **10** cartons, enter **Tharushi Silva**, tick verification, set delivery time and **Confirm delivery**. Expect **Pending sync**, not confirmed server completion.
26. Reload while Offline. Expect saved progress and pending actions to remain. Account sign-out must refuse to discard pending work.
27. Change Network to **No throttling**. Expect **Syncing** (possibly brief) then **Synced**, zero pending actions and authoritative route refresh. Use **Sync now** if needed. A Needs attention state is a real conflict, not success; follow the [Stage 8 conflict guidance](stage-08-offline.md).
28. Confirm **COMPLETED** / **A good run. Every store replenished.** The final accepted POD normally completes the route automatically; if a resolved receipt exception kept it open, use **Complete route** after reconciliation.
29. Choose **Account → Sign out**.
30. Log in as **store@relay.demo** and open **Order tracking**. Both OUT004 orders show Delivered, **Sahan Jayawardena**, carton counts, time and POD. OUT005 is outside this Store's scope.
31. On CHILLED, select **View receipt**, inspect 12 cartons and recipient, then **Confirm receipt** (or report a discrepancy, resolve it with details, then confirm). Expect Received (RECEIVED). Close the confirmed receipt dialog with its **Close dialog** button.
32. On AMBIENT, select **View receipt**, inspect 8 cartons and recipient, then **Confirm receipt**. Expect Received. Close the dialog.
33. Reload and reopen tracking. Both receipts must remain confirmed; the capacity order remains deferred. This verifies persisted state rather than browser fixture data.
34. Sign out, log in as Dispatcher, and load **2025-01-02** again. Inspect COMPLETED, completed stops, LOADED checks, POD/Received labels and the saved capacity explanation. The extra assigned van trip remains RELEASED and is intentionally outside the completed main route.

For replay use a separate fresh Compose project/database; repeat seed is deliberately non-destructive. Do not delete site data while pending work exists. Additional exception/return-visit/account-isolation cases and precise network mechanics are documented in [Stage 8](stage-08-offline.md); historical Stage 6/7 guides use authorized supplied data and may name a different van vehicle.

For new ordering and auditable deferred carry-forward, follow steps 1, 8 and 9 of the root README. The same production judge startup supports these actions; no browser console or development-only clock is required. Frozen and chilled goods require refrigerated vehicles. Calendar demand flags are displayed, and monsoon days apply the documented conservative travel-time allowance.
