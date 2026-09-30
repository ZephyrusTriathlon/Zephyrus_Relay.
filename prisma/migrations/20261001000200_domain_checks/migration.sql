-- Scalar invariants belong in the database as well as in import validation.
-- Cross-record allocation feasibility and lifecycle transitions belong to later services.
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_positive_capacities" CHECK (
  "weightCapacityKg" > 0 AND "volumeCapacityM3" > 0 AND "kmPerLitre" > 0 AND "weeklyFuelQuotaL" > 0
);
ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_delivery_window" CHECK (
  "windowOpenTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND
  "windowCloseTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "windowOpenTime" < "windowCloseTime"
);
ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_mall_window" CHECK (
  "mallWindow" IS NULL OR (
    "mallWindow" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$' AND
    left("mallWindow", 5) < right("mallWindow", 5)
  )
);
ALTER TABLE "Order" ADD CONSTRAINT "Order_delivery_window" CHECK (
  "windowOpenTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND
  "windowCloseTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "windowOpenTime" < "windowCloseTime"
);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_positive_quantity" CHECK (
  "lineNumber" > 0 AND "cartons" > 0 AND "unitWeightKg" > 0 AND "unitVolumeM3" > 0
);
ALTER TABLE "CalendarDay" ADD CONSTRAINT "CalendarDay_valid_ranges" CHECK (
  "dayOfWeek" BETWEEN 0 AND 6 AND "isoWeek" BETWEEN 1 AND 53 AND
  "isoYear" BETWEEN 1900 AND 2200 AND "festivalRamp" BETWEEN 0 AND 1
);
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_positive_sequence" CHECK ("sequence" > 0);
ALTER TABLE "TripStop" ADD CONSTRAINT "TripStop_positive_position" CHECK ("position" > 0);
ALTER TABLE "LoadingCheck" ADD CONSTRAINT "LoadingCheck_nonnegative_cartons" CHECK ("loadedCartons" >= 0);
ALTER TABLE "ProofOfDelivery" ADD CONSTRAINT "ProofOfDelivery_positive_cartons" CHECK ("deliveredCartons" > 0);
ALTER TABLE "ReceiptConfirmation" ADD CONSTRAINT "ReceiptConfirmation_positive_cartons" CHECK ("receivedCartons" > 0);
ALTER TABLE "SyncMutation" ADD CONSTRAINT "SyncMutation_nonnegative_version" CHECK ("baseVersion" >= 0);
