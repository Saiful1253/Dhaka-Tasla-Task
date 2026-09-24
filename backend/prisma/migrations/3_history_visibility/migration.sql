-- History removal is a soft delete so active manifests, audit events, and
-- foreign-key relationships remain consistent for the other participants.
ALTER TABLE "ride_requests" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "pools" ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "ride_requests_passenger_id_deleted_at_idx"
ON "ride_requests" ("passenger_id", "deleted_at");

CREATE INDEX "pools_vehicle_id_deleted_at_idx"
ON "pools" ("vehicle_id", "deleted_at");
