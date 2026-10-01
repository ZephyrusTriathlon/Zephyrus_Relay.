CREATE TABLE "OrderStatusEvent" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES "Order"("id") ON DELETE RESTRICT,
  "status" "OrderStatus" NOT NULL,
  "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT NOT NULL
);
CREATE INDEX "OrderStatusEvent_orderId_occurredAt_idx" ON "OrderStatusEvent"("orderId", "occurredAt");
-- Preserve existing facts without inventing historical transitions.
INSERT INTO "OrderStatusEvent" ("id", "orderId", "status", "occurredAt", "note")
SELECT gen_random_uuid()::text, "id", "status", "updatedAt", 'Status snapshot at Stage 4 migration' FROM "Order";
CREATE FUNCTION record_order_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "OrderStatusEvent" ("id", "orderId", "status", "occurredAt", "note")
    VALUES (gen_random_uuid()::text, NEW."id", NEW."status", NEW."createdAt", 'Order created');
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    INSERT INTO "OrderStatusEvent" ("id", "orderId", "status", "note")
    VALUES (gen_random_uuid()::text, NEW."id", NEW."status", 'Order status changed');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_status_history AFTER INSERT OR UPDATE ON "Order"
FOR EACH ROW EXECUTE FUNCTION record_order_status();
