-- Additive snapshots: retain existing plans and historical deferrals unchanged.
ALTER TABLE "Trip" ADD COLUMN "planningContext" JSONB;
ALTER TABLE "Deferral" ADD COLUMN "planningContext" JSONB;
