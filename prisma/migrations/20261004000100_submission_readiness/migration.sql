ALTER TYPE "TemperatureRequirement" ADD VALUE 'FROZEN';
ALTER TABLE "Order" ADD COLUMN "requestedDeliveryDate" DATE;
UPDATE "Order" SET "requestedDeliveryDate" = "deliveryDate";
