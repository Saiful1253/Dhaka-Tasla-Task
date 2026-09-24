-- A vehicle may have at most one non-terminal pool. The API checks this before
-- opening a pool; this partial unique index closes the remaining concurrent
-- create race at the database boundary.
CREATE UNIQUE INDEX "pools_one_active_per_vehicle_idx"
ON "pools" ("vehicle_id")
WHERE "status" IN ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED');
