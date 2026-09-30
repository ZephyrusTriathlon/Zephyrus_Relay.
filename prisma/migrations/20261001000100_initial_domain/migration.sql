-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DISPATCHER', 'LOADER', 'DRIVER', 'STORE_MANAGER');

-- CreateEnum
CREATE TYPE "RecordSource" AS ENUM ('SUPPLIED', 'DEMO', 'APPLICATION');

-- CreateEnum
CREATE TYPE "Brand" AS ENUM ('FRESH', 'STYLE', 'TECH');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('VAN', 'TRUCK');

-- CreateEnum
CREATE TYPE "TemperatureCapability" AS ENUM ('AMBIENT', 'REEFER');

-- CreateEnum
CREATE TYPE "TemperatureRequirement" AS ENUM ('AMBIENT', 'CHILLED');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('DIESEL');

-- CreateEnum
CREATE TYPE "DockType" AS ENUM ('STREET', 'REAR_DOCK', 'MALL_BAY');

-- CreateEnum
CREATE TYPE "ParkingConstraint" AS ENUM ('NORMAL', 'VAN_ONLY', 'MALL_DOCK');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CONFIRMED', 'PLANNED', 'DEFERRED', 'RELEASED', 'IN_DELIVERY', 'DELIVERED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'RELEASED', 'LOADING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StopStatus" AS ENUM ('PENDING', 'ARRIVED', 'COMPLETED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "LoadingStatus" AS ENUM ('PENDING', 'LOADED', 'ISSUE');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "LoadingIssueType" AS ENUM ('MISSING', 'DAMAGED', 'QUANTITY_MISMATCH', 'OTHER');

-- CreateEnum
CREATE TYPE "DeliveryEventType" AS ENUM ('STARTED', 'ARRIVED', 'DEFERRED', 'REATTEMPTED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "DeliveryExceptionType" AS ENUM ('STORE_CLOSED', 'RECIPIENT_UNAVAILABLE', 'DAMAGED_GOODS', 'PARTIAL_DELIVERY', 'REFUSED', 'ACCESS_DELAYED');

-- CreateEnum
CREATE TYPE "DeferralReason" AS ENUM ('CAPACITY', 'TEMPERATURE', 'ACCESS', 'DELIVERY_WINDOW', 'FUEL', 'TIME_BUDGET', 'OTHER');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED', 'CONFLICT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" "RecordSource" NOT NULL DEFAULT 'APPLICATION',
    "outletId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Depot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "RecordSource" NOT NULL DEFAULT 'SUPPLIED',

    CONSTRAINT "Depot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outlet" (
    "id" TEXT NOT NULL,
    "brand" "Brand" NOT NULL,
    "district" TEXT NOT NULL,
    "depotId" TEXT NOT NULL,
    "dockType" "DockType" NOT NULL,
    "parkingConstraint" "ParkingConstraint" NOT NULL,
    "mallWindow" VARCHAR(11),
    "windowOpenTime" VARCHAR(5) NOT NULL,
    "windowCloseTime" VARCHAR(5) NOT NULL,
    "source" "RecordSource" NOT NULL DEFAULT 'SUPPLIED',

    CONSTRAINT "Outlet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "temperature" "TemperatureCapability" NOT NULL,
    "weightCapacityKg" DECIMAL(12,3) NOT NULL,
    "volumeCapacityM3" DECIMAL(12,3) NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "kmPerLitre" DECIMAL(10,3) NOT NULL,
    "weeklyFuelQuotaL" DECIMAL(12,3) NOT NULL,
    "depotId" TEXT NOT NULL,
    "source" "RecordSource" NOT NULL DEFAULT 'SUPPLIED',

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarDay" (
    "date" DATE NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "dayName" VARCHAR(3) NOT NULL,
    "isWeekend" BOOLEAN NOT NULL,
    "isoYear" INTEGER NOT NULL,
    "isoWeek" INTEGER NOT NULL,
    "isPayday" BOOLEAN NOT NULL,
    "festival" TEXT,
    "festivalRamp" DECIMAL(3,2) NOT NULL,
    "isHoliday" BOOLEAN NOT NULL,
    "monsoon" BOOLEAN NOT NULL,
    "isOperating" BOOLEAN NOT NULL,
    "source" "RecordSource" NOT NULL DEFAULT 'SUPPLIED',

    CONSTRAINT "CalendarDay_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "temperatureRequirement" "TemperatureRequirement" NOT NULL,
    "windowOpenTime" VARCHAR(5) NOT NULL,
    "windowCloseTime" VARCHAR(5) NOT NULL,
    "createdById" TEXT,
    "source" "RecordSource" NOT NULL DEFAULT 'APPLICATION',
    "demoScenario" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cartons" INTEGER NOT NULL,
    "unitWeightKg" DECIMAL(12,3) NOT NULL,
    "unitVolumeM3" DECIMAL(12,3) NOT NULL,
    "temperatureRequirement" "TemperatureRequirement" NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "tripNumber" TEXT NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "depotId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT,
    "status" "TripStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "RecordSource" NOT NULL DEFAULT 'APPLICATION',
    "plannedDepartureAt" TIMESTAMPTZ(6),
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripStop" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "StopStatus" NOT NULL DEFAULT 'PENDING',
    "expectedAt" TIMESTAMPTZ(6),
    "arrivedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),

    CONSTRAINT "TripStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "tripStopId" TEXT NOT NULL,
    "allocatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deferral" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reason" "DeferralReason" NOT NULL,
    "explanation" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "deferredById" TEXT,
    "deferredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextEligibleDate" DATE,
    "resolvedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Deferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadingCheck" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "status" "LoadingStatus" NOT NULL DEFAULT 'PENDING',
    "loadedCartons" INTEGER NOT NULL DEFAULT 0,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "LoadingCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadingIssue" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "type" "LoadingIssueType" NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "details" TEXT NOT NULL,
    "resolution" TEXT,
    "reportedById" TEXT,
    "reportedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(6),

    CONSTRAINT "LoadingIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryEvent" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "type" "DeliveryEventType" NOT NULL,
    "actorId" TEXT,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "recordedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryException" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "type" "DeliveryExceptionType" NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "details" TEXT NOT NULL,
    "resolution" TEXT,
    "reportedById" TEXT,
    "reportedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(6),

    CONSTRAINT "DeliveryException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProofOfDelivery" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "deliveredCartons" INTEGER NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMPTZ(6) NOT NULL,
    "recordedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "driverId" TEXT NOT NULL,

    CONSTRAINT "ProofOfDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptConfirmation" (
    "id" TEXT NOT NULL,
    "proofId" TEXT NOT NULL,
    "confirmedById" TEXT NOT NULL,
    "receivedCartons" INTEGER NOT NULL,
    "confirmedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "ReceiptConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncMutation" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "clientMutationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "clientOccurredAt" TIMESTAMPTZ(6) NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMPTZ(6),
    "errorCode" TEXT,

    CONSTRAINT "SyncMutation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_outletId_idx" ON "User"("outletId");

-- CreateIndex
CREATE UNIQUE INDEX "Depot_name_key" ON "Depot"("name");

-- CreateIndex
CREATE INDEX "Outlet_depotId_brand_idx" ON "Outlet"("depotId", "brand");

-- CreateIndex
CREATE INDEX "Vehicle_depotId_type_temperature_idx" ON "Vehicle"("depotId", "type", "temperature");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_outletId_deliveryDate_idx" ON "Order"("outletId", "deliveryDate");

-- CreateIndex
CREATE INDEX "Order_deliveryDate_status_idx" ON "Order"("deliveryDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Order_id_outletId_key" ON "Order"("id", "outletId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_lineNumber_key" ON "OrderItem"("orderId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_tripNumber_key" ON "Trip"("tripNumber");

-- CreateIndex
CREATE INDEX "Trip_deliveryDate_status_idx" ON "Trip"("deliveryDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_vehicleId_deliveryDate_sequence_key" ON "Trip"("vehicleId", "deliveryDate", "sequence");

-- CreateIndex
CREATE INDEX "TripStop_outletId_idx" ON "TripStop"("outletId");

-- CreateIndex
CREATE UNIQUE INDEX "TripStop_tripId_position_key" ON "TripStop"("tripId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TripStop_id_tripId_outletId_key" ON "TripStop"("id", "tripId", "outletId");

-- CreateIndex
CREATE UNIQUE INDEX "Allocation_orderId_key" ON "Allocation"("orderId");

-- CreateIndex
CREATE INDEX "Allocation_tripId_idx" ON "Allocation"("tripId");

-- CreateIndex
CREATE INDEX "Allocation_tripStopId_tripId_outletId_idx" ON "Allocation"("tripStopId", "tripId", "outletId");

-- CreateIndex
CREATE UNIQUE INDEX "Allocation_orderId_outletId_key" ON "Allocation"("orderId", "outletId");

-- CreateIndex
CREATE INDEX "Deferral_orderId_deferredAt_idx" ON "Deferral"("orderId", "deferredAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoadingCheck_allocationId_key" ON "LoadingCheck"("allocationId");

-- CreateIndex
CREATE INDEX "LoadingIssue_allocationId_status_idx" ON "LoadingIssue"("allocationId", "status");

-- CreateIndex
CREATE INDEX "DeliveryEvent_allocationId_occurredAt_idx" ON "DeliveryEvent"("allocationId", "occurredAt");

-- CreateIndex
CREATE INDEX "DeliveryException_allocationId_status_idx" ON "DeliveryException"("allocationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProofOfDelivery_allocationId_key" ON "ProofOfDelivery"("allocationId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptConfirmation_proofId_key" ON "ReceiptConfirmation"("proofId");

-- CreateIndex
CREATE INDEX "SyncMutation_actorId_receivedAt_idx" ON "SyncMutation"("actorId", "receivedAt");

-- CreateIndex
CREATE INDEX "SyncMutation_entityType_entityId_idx" ON "SyncMutation"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncMutation_deviceId_clientMutationId_key" ON "SyncMutation"("deviceId", "clientMutationId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripStop" ADD CONSTRAINT "TripStop_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripStop" ADD CONSTRAINT "TripStop_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_orderId_outletId_fkey" FOREIGN KEY ("orderId", "outletId") REFERENCES "Order"("id", "outletId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_tripStopId_tripId_outletId_fkey" FOREIGN KEY ("tripStopId", "tripId", "outletId") REFERENCES "TripStop"("id", "tripId", "outletId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deferral" ADD CONSTRAINT "Deferral_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deferral" ADD CONSTRAINT "Deferral_deferredById_fkey" FOREIGN KEY ("deferredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadingCheck" ADD CONSTRAINT "LoadingCheck_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "Allocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadingCheck" ADD CONSTRAINT "LoadingCheck_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadingIssue" ADD CONSTRAINT "LoadingIssue_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "Allocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadingIssue" ADD CONSTRAINT "LoadingIssue_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "Allocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryException" ADD CONSTRAINT "DeliveryException_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "Allocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryException" ADD CONSTRAINT "DeliveryException_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofOfDelivery" ADD CONSTRAINT "ProofOfDelivery_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "Allocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofOfDelivery" ADD CONSTRAINT "ProofOfDelivery_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptConfirmation" ADD CONSTRAINT "ReceiptConfirmation_proofId_fkey" FOREIGN KEY ("proofId") REFERENCES "ProofOfDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptConfirmation" ADD CONSTRAINT "ReceiptConfirmation_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncMutation" ADD CONSTRAINT "SyncMutation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
