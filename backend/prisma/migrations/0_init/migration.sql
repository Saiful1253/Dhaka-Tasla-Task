-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('passenger', 'driver');

-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PoolStatus" AS ENUM ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'teslapay');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'refunded');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" SERIAL NOT NULL,
    "driver_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "plate" TEXT,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_requests" (
    "id" SERIAL NOT NULL,
    "passenger_id" INTEGER NOT NULL,
    "pickup_area_id" INTEGER NOT NULL,
    "dest_area_id" INTEGER NOT NULL,
    "seats_requested" INTEGER NOT NULL DEFAULT 1,
    "status" "RideStatus" NOT NULL DEFAULT 'REQUESTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pools" (
    "id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "status" "PoolStatus" NOT NULL DEFAULT 'REQUESTED',
    "capacity" INTEGER NOT NULL,
    "seats_taken" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pool_members" (
    "id" SERIAL NOT NULL,
    "pool_id" INTEGER NOT NULL,
    "request_id" INTEGER NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "fare_paisa" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pool_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fares" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "base_paisa" INTEGER NOT NULL,
    "distance_paisa" INTEGER NOT NULL,
    "discount_paisa" INTEGER NOT NULL DEFAULT 0,
    "total_paisa" INTEGER NOT NULL,
    "distance_km" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "fares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_events" (
    "id" SERIAL NOT NULL,
    "pool_id" INTEGER NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "fare_id" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "vehicles_driver_id_idx" ON "vehicles"("driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "areas_name_key" ON "areas"("name");

-- CreateIndex
CREATE INDEX "ride_requests_passenger_id_idx" ON "ride_requests"("passenger_id");

-- CreateIndex
CREATE INDEX "ride_requests_status_idx" ON "ride_requests"("status");

-- CreateIndex
CREATE INDEX "pools_status_idx" ON "pools"("status");

-- CreateIndex
CREATE INDEX "pools_vehicle_id_idx" ON "pools"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "pool_members_request_id_key" ON "pool_members"("request_id");

-- CreateIndex
CREATE INDEX "pool_members_pool_id_idx" ON "pool_members"("pool_id");

-- CreateIndex
CREATE UNIQUE INDEX "fares_request_id_key" ON "fares"("request_id");

-- CreateIndex
CREATE INDEX "ride_events_pool_id_at_idx" ON "ride_events"("pool_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_fare_id_key" ON "payments"("fare_id");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_pickup_area_id_fkey" FOREIGN KEY ("pickup_area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_dest_area_id_fkey" FOREIGN KEY ("dest_area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pools" ADD CONSTRAINT "pools_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "ride_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fares" ADD CONSTRAINT "fares_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "ride_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_fare_id_fkey" FOREIGN KEY ("fare_id") REFERENCES "fares"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Second net for the capacity invariant (atomic UPDATE in app code is the first)
ALTER TABLE "pools" ADD CONSTRAINT "pools_capacity_check" CHECK ("seats_taken" >= 0 AND "seats_taken" <= "capacity");
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_capacity_check" CHECK ("capacity" > 0);

-- Second net for the capacity invariant (app-level atomic UPDATE is the first net)
