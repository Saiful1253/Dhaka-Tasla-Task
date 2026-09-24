import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { PoolStatus, Prisma, RideStatus } from "@prisma/client";
import { z } from "zod";
import { prisma, interactiveTransactionOptions } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { errors } from "../lib/errors";
import { areCompatible } from "../lib/matching";
import { haversineKm } from "../lib/geo";
import { config } from "../config";
import { recalculatePoolFaresTx } from "../lib/pool-fares";
import { assertPoolTransition } from "../lib/transitions";

type Tx = Prisma.TransactionClient;

/**
 * ATOMIC SEAT CLAIM - the heart of the capacity invariant.
 *
 * UPDATE ... WHERE seats_taken + $n <= capacity is a single statement:
 * Postgres locks the row, so two concurrent claims (Nusrat & Shirin racing for
 * the last seat) serialize - exactly one succeeds, the other sees 0 rows => 409.
 * No read-then-write gap, no overbooking.
 * Second net: CHECK constraint in the migration + this WHERE clause.
 */
async function claimSeatsTx(
  tx: Tx,
  poolId: number,
  seats: number
): Promise<boolean> {
  const updated = await tx.$executeRaw`
    UPDATE pools
       SET seats_taken = seats_taken + ${seats}
     WHERE id = ${poolId}
       AND seats_taken + ${seats} <= capacity
       AND status IN ('REQUESTED', 'MATCHED')`;
  return updated === 1;
}

async function guardPool(poolId: number) {
  const pool = await prisma.pool.findFirst({
    where: { id: poolId, deletedAt: null },
    include: { vehicle: true },
  });
  if (!pool) throw errors.notFound("Pool");
  return pool;
}

function assertDriverOwns(vehicleDriverId: number, userId: number) {
  if (vehicleDriverId !== userId) throw errors.forbidden("Not your vehicle");
}

type RouteRequest = {
  pickupArea: { lat: number; lng: number };
  destArea: { lat: number; lng: number };
};

function tripEnds(route: RouteRequest) {
  return {
    pickup: { lat: route.pickupArea.lat, lng: route.pickupArea.lng },
    dest: { lat: route.destArea.lat, lng: route.destArea.lng },
  };
}

function requestsShareCorridor(routes: RouteRequest[]): boolean {
  // Compatibility is pairwise. Checking every route against the first member
  // alone is incorrect when nearby pickup groups overlap in a larger manifest.
  return routes.every((route, index) =>
    routes
      .slice(index + 1)
      .every((other) => areCompatible(tripEnds(route), tripEnds(other))),
  );
}

const openPoolSchema = z.object({
  requestIds: z
    .array(z.number().int().positive())
    .min(1)
    .transform((ids) => [...new Set(ids)]),
});
const addRequestsSchema = openPoolSchema;
const driverLocationSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});
const TERMINAL_POOL_STATUSES = ["COMPLETED", "CANCELLED"] as const;

function assertPoolHistoryDeletable(status: string): void {
  if (!TERMINAL_POOL_STATUSES.includes(status as (typeof TERMINAL_POOL_STATUSES)[number])) {
    throw errors.conflict(
      "HISTORY_NOT_DELETABLE",
      "Only completed or cancelled pools can be removed from history",
    );
  }
}

// ---------------------------------------------------------------------------
// Driver endpoints
// ---------------------------------------------------------------------------

export const driverRouter = Router();
driverRouter.use(requireAuth, requireRole("driver"));

/** GET /driver/requests - waiting rides for this driver's manual selection board */
driverRouter.get("/requests", async (req, res, next) => {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { driverId: req.user!.id },
    });
    if (!vehicle) throw errors.notFound("Vehicle");

    const [open, activePool] = await Promise.all([
      prisma.rideRequest.findMany({
        where: { status: "REQUESTED", deletedAt: null },
        include: {
          passenger: { select: { id: true, name: true } },
          pickupArea: true,
          destArea: true,
          fare: true,
        },
        // Soft first-come priority: the oldest compatible request is shown
        // first, while the driver remains in control of the final selection.
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      prisma.pool.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: { in: ["REQUESTED", "MATCHED", "DRIVER_ARRIVED", "STARTED"] },
        },
        include: {
          members: {
            include: {
              request: { include: { pickupArea: true, destArea: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const activeRoutes = activePool?.members.map((member) => member.request) ?? [];
    const remainingSeats = activePool
      ? Math.max(0, activePool.capacity - activePool.seatsTaken)
      : vehicle.capacity;
    const driverLocation =
      vehicle.currentLat !== null && vehicle.currentLng !== null
        ? {
            lat: vehicle.currentLat,
            lng: vehicle.currentLng,
            updatedAt: vehicle.locationUpdatedAt?.toISOString() ?? null,
          }
        : null;

    const distanceToDriver = (pickup: { lat: number; lng: number }) =>
      driverLocation
        ? Number(
            haversineKm(
              driverLocation.lat,
              driverLocation.lng,
              pickup.lat,
              pickup.lng
            ).toFixed(2)
          )
        : null;

    // The queue is already oldest-first. Pick the first nearby request that
    // can also fit the active corridor, then expose it as a one-click suggestion.
    const suggestedRequestId =
      vehicle.isOnline && driverLocation
        ? open.find((request) => {
            const distance = distanceToDriver(request.pickupArea);
            const fitsActivePool = activePool
              ? requestsShareCorridor([...activeRoutes, request])
              : true;
            return (
              distance !== null &&
              distance <= config.matching.pickupRadiusKm &&
              request.seatsRequested <= remainingSeats &&
              (!activePool || activePool.status === "MATCHED") &&
              fitsActivePool
            );
          })?.id ?? null
        : null;

    res.json({
      vehicle: {
        id: vehicle.id,
        name: vehicle.name,
        capacity: vehicle.capacity,
        isOnline: vehicle.isOnline,
        location: driverLocation,
      },
      requests: open.map((r) => {
        const fitsActivePool = activePool
          ? requestsShareCorridor([...activeRoutes, r])
          : null;
        const driverDistanceKm = distanceToDriver(r.pickupArea);
        const nearDriver =
          driverDistanceKm !== null &&
          driverDistanceKm <= config.matching.pickupRadiusKm;
        return {
          id: r.id,
          passenger: r.passenger,
          pickup: r.pickupArea.name,
          dest: r.destArea.name,
          pickupLocation: { lat: r.pickupArea.lat, lng: r.pickupArea.lng },
          destLocation: { lat: r.destArea.lat, lng: r.destArea.lng },
          seats: r.seatsRequested,
          status: r.status,
          estimatedFareTaka: r.fare?.totalTaka ?? null,
          createdAt: r.createdAt,
          compatibility: {
            activePoolId: activePool?.id ?? null,
            activePoolStatus: activePool?.status ?? null,
            fitsActivePool,
            addableToActivePool:
              activePool?.status === "MATCHED" &&
              vehicle.isOnline &&
              Boolean(fitsActivePool) &&
              r.seatsRequested <= remainingSeats,
            compatibleRequestIds: open
              .filter((other) => other.id !== r.id)
              .filter((other) => areCompatible(tripEnds(r), tripEnds(other)))
              .map((other) => other.id),
            driverDistanceKm,
            nearDriver,
            suggested: r.id === suggestedRequestId,
            suggestionReason:
              r.id === suggestedRequestId
                ? activePool
                  ? "MATCHES_ACTIVE_POOL"
                  : "NEAR_DRIVER"
                : null,
          },
        };
      }),
    });
  } catch (e) {
    next(e);
  }
});

/** POST /driver/online - toggle availability */
driverRouter.post("/online", async (req, res, next) => {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { driverId: req.user!.id },
    });
    if (!vehicle) throw errors.notFound("Vehicle");
    const updated = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        isOnline: !vehicle.isOnline,
        ...(vehicle.isOnline
          ? { currentLat: null, currentLng: null, locationUpdatedAt: null }
          : {}),
      },
    });
    res.json({ isOnline: updated.isOnline });
  } catch (e) {
    next(e);
  }
});

/** POST /driver/location - share a browser GPS point while the vehicle is online */
driverRouter.post("/location", async (req, res, next) => {
  try {
    const location = driverLocationSchema.parse(req.body);
    const vehicle = await prisma.vehicle.findFirst({
      where: { driverId: req.user!.id },
    });
    if (!vehicle) throw errors.notFound("Vehicle");
    if (!vehicle.isOnline) {
      throw errors.conflict(
        "VEHICLE_OFFLINE",
        "Go online before sharing your location"
      );
    }

    const locationUpdatedAt = new Date();
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        currentLat: location.lat,
        currentLng: location.lng,
        locationUpdatedAt,
      },
    });
    res.json({
      location: { ...location, updatedAt: locationUpdatedAt.toISOString() },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /driver/pools - manually assign one or more passenger requests.
 * Nothing is matched automatically; only request IDs chosen by this driver
 * are committed. Capacity is enforced atomically; over-capacity => 409 NO_SEATS.
 */
driverRouter.post("/pools", async (req, res, next) => {
  try {
    const { requestIds } = openPoolSchema.parse(req.body);

    const vehicle = await prisma.vehicle.findFirst({
      where: { driverId: req.user!.id },
    });
    if (!vehicle) throw errors.notFound("Vehicle");
    if (!vehicle.isOnline) {
      throw errors.conflict("VEHICLE_OFFLINE", "Go online before accepting rides");
    }

    const existingActivePool = await prisma.pool.findFirst({
      where: {
        vehicleId: vehicle.id,
        status: { in: ["REQUESTED", "MATCHED", "DRIVER_ARRIVED", "STARTED"] },
      },
      select: { id: true },
    });
    if (existingActivePool) {
      throw errors.conflict(
        "ACTIVE_POOL_EXISTS",
        `Add compatible requests to active pool #${existingActivePool.id} instead`
      );
    }

    const requests = await prisma.rideRequest.findMany({
      where: { id: { in: requestIds }, status: "REQUESTED" },
      include: { pickupArea: true, destArea: true },
    });
    if (requests.length !== requestIds.length) {
      throw errors.conflict(
        "REQUEST_UNAVAILABLE",
        "Some requests are no longer available"
      );
    }

    // Every selected trip must fit the same corridor. The service remains
    // authoritative; the frontend's compatibility hints never replace it.
    if (!requestsShareCorridor(requests)) {
      throw errors.conflict(
        "INCOMPATIBLE",
        "These trips travel in opposite directions or do not share a compatible corridor"
      );
    }

    const totalSeats = requests.reduce((s, r) => s + r.seatsRequested, 0);
    if (totalSeats > vehicle.capacity) throw errors.noSeats();

    const pool = await prisma.$transaction(async (tx) => {
      const activeInsideTransaction = await tx.pool.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: { in: ["REQUESTED", "MATCHED", "DRIVER_ARRIVED", "STARTED"] },
        },
        select: { id: true },
      });
      if (activeInsideTransaction) {
        throw errors.conflict(
          "ACTIVE_POOL_EXISTS",
          `Add compatible requests to active pool #${activeInsideTransaction.id} instead`
        );
      }

      const p = await tx.pool.create({
        data: {
          vehicleId: vehicle.id,
          status: "MATCHED",
          capacity: vehicle.capacity,
          seatsTaken: 0,
        },
      });

      for (const r of requests) {
        const ok = await claimSeatsTx(tx, p.id, r.seatsRequested);
        if (!ok) throw errors.noSeats();

        await tx.poolMember.create({
          data: {
            poolId: p.id,
            requestId: r.id,
            seats: r.seatsRequested,
            fareTaka: 0,
          },
        });
        await tx.rideRequest.update({
          where: { id: r.id },
          data: { status: "MATCHED" },
        });
      }

      await tx.rideEvent.create({
        data: {
          poolId: p.id,
          actorId: req.user!.id,
          fromStatus: "NONE",
          toStatus: "MATCHED",
          note: `Driver manually assigned ${requests.length} passenger request(s)`,
        },
      });

      await recalculatePoolFaresTx(tx, p.id);
      return p;
    }, interactiveTransactionOptions);

    const updatedPool = await prisma.pool.findUnique({
      where: { id: pool.id },
    });
    res.status(201).json({ pool: updatedPool });
  } catch (e) {
    next(e);
  }
});

/** GET /driver/pools - driver's pools + passengers/seats + history */
driverRouter.get("/pools", async (req, res, next) => {
  try {
    const pools = await prisma.pool.findMany({
      where: { vehicle: { driverId: req.user!.id }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        vehicle: true,
        members: {
          include: {
            request: {
              include: {
                passenger: { select: { id: true, name: true } },
                pickupArea: true,
                destArea: true,
              },
            },
          },
        },
        events: { orderBy: { at: "asc" } },
      },
    });
    res.json({ pools });
  } catch (e) {
    next(e);
  }
});

/** DELETE /driver/history - remove every completed/cancelled pool from my history. */
driverRouter.delete("/history", async (req, res, next) => {
  try {
    const result = await prisma.pool.updateMany({
      where: {
        vehicle: { driverId: req.user!.id },
        status: { in: [...TERMINAL_POOL_STATUSES] },
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    res.json({ ok: true, deletedCount: result.count });
  } catch (e) {
    next(e);
  }
});

/** DELETE /driver/history/:id - remove one completed/cancelled pool from my history. */
driverRouter.delete("/history/:id", async (req, res, next) => {
  try {
    const poolId = Number(req.params.id);
    const pool = await prisma.pool.findFirst({
      where: { id: poolId, vehicle: { driverId: req.user!.id }, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!pool) throw errors.notFound("Pool");
    assertPoolHistoryDeletable(pool.status);

    const result = await prisma.pool.updateMany({
      where: {
        id: poolId,
        vehicle: { driverId: req.user!.id },
        status: { in: [...TERMINAL_POOL_STATUSES] },
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    if (result.count !== 1) {
      throw errors.conflict("HISTORY_CHANGED", "This pool changed while it was being removed");
    }

    res.json({ ok: true, id: poolId, deletedCount: result.count });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /driver/pools/:id/requests - add compatible waiting requests to the
 * driver's matched pool. Capacity, corridor, status, and membership writes
 * commit together so a failed add never consumes a seat.
 */
driverRouter.post("/pools/:id/requests", async (req, res, next) => {
  try {
    const poolId = Number(req.params.id);
    const { requestIds } = addRequestsSchema.parse(req.body);
    const pool = await guardPool(poolId);
    assertDriverOwns(pool.vehicle.driverId, req.user!.id);
    if (!pool.vehicle.isOnline) {
      throw errors.conflict("VEHICLE_OFFLINE", "Go online before adding passengers");
    }
    if (pool.status !== "MATCHED") {
      throw errors.conflict(
        "POOL_CLOSED",
        "Passengers can only be added while the pool is matched"
      );
    }

    const [members, requests] = await Promise.all([
      prisma.poolMember.findMany({
        where: { poolId },
        include: { request: { include: { pickupArea: true, destArea: true } } },
      }),
      prisma.rideRequest.findMany({
        where: { id: { in: requestIds }, status: "REQUESTED", deletedAt: null },
        include: { pickupArea: true, destArea: true },
      }),
    ]);

    if (requests.length !== requestIds.length) {
      throw errors.conflict(
        "REQUEST_UNAVAILABLE",
        "Some requests are no longer available"
      );
    }
    if (!requestsShareCorridor([...members.map((member) => member.request), ...requests])) {
      throw errors.conflict(
        "INCOMPATIBLE",
        "One or more trips travel in an opposite direction or do not fit this pool's corridor"
      );
    }

    const requestedSeats = requests.reduce(
      (sum, request) => sum + request.seatsRequested,
      0
    );
    if (pool.seatsTaken + requestedSeats > pool.capacity) {
      throw errors.noSeats(
        `Only ${Math.max(0, pool.capacity - pool.seatsTaken)} seat(s) remain in this pool`
      );
    }

    const updatedPoolId = await prisma.$transaction(async (tx) => {
      for (const request of requests) {
        const claimed = await claimSeatsTx(tx, poolId, request.seatsRequested);
        if (!claimed) {
          throw errors.noSeats(
            "The pool changed while requests were being added. No seats were claimed."
          );
        }
        await tx.poolMember.create({
          data: {
            poolId,
            requestId: request.id,
            seats: request.seatsRequested,
            fareTaka: 0,
          },
        });
        await tx.rideRequest.update({
          where: { id: request.id },
          data: { status: "MATCHED" },
        });
      }

      await tx.rideEvent.create({
        data: {
          poolId,
          actorId: req.user!.id,
          fromStatus: "MATCHED",
          toStatus: "MATCHED",
          note: `Driver manually added ${requests.length} compatible passenger request(s)`,
        },
      });
      await recalculatePoolFaresTx(tx, poolId);
      return poolId;
    }, interactiveTransactionOptions);

    const updatedPool = await prisma.pool.findUnique({
      where: { id: updatedPoolId },
    });
    res.status(201).json({ pool: updatedPool });
  } catch (e) {
    next(e);
  }
});

/** Lifecycle helper - guarded transition + mirrored status + audit event. */
async function transition(
  req: Request,
  res: Response,
  next: NextFunction,
  to: Exclude<PoolStatus, "REQUESTED">
) {
  try {
    const poolId = Number(req.params.id);
    const result = await prisma.$transaction(async (tx) => {
      const pool = await tx.pool.findUnique({
        where: { id: poolId },
        include: { vehicle: true },
      });
      if (!pool) throw errors.notFound("Pool");
      assertDriverOwns(pool.vehicle.driverId, req.user!.id);
      assertPoolTransition(pool.status, to);

      // Make the source state part of the write. If another lifecycle request
      // moved the pool first, this update loses the race and returns 409.
      const updated = await tx.pool.updateMany({
        where: { id: pool.id, status: pool.status },
        data: {
          status: to,
          ...(to === "STARTED" ? { startedAt: new Date() } : {}),
          ...(to === "COMPLETED" ? { completedAt: new Date() } : {}),
        },
      });
      if (updated.count !== 1) {
        throw errors.invalidTransition(pool.status, to);
      }

      await tx.rideRequest.updateMany({
        where: { poolMembers: { some: { poolId: pool.id } } },
        data: { status: to as RideStatus },
      });
      await tx.rideEvent.create({
        data: {
          poolId: pool.id,
          actorId: req.user!.id,
          fromStatus: pool.status,
          toStatus: to,
        },
      });
      return { id: pool.id, status: to };
    }, interactiveTransactionOptions);

    res.json({ poolId: result.id, status: result.status });
  } catch (e) {
    next(e);
  }
}

driverRouter.post("/pools/:id/arrived", (req, res, next) =>
  transition(req, res, next, "DRIVER_ARRIVED")
);
driverRouter.post("/pools/:id/start", (req, res, next) =>
  transition(req, res, next, "STARTED")
);
driverRouter.post("/pools/:id/complete", (req, res, next) =>
  transition(req, res, next, "COMPLETED")
);
driverRouter.post("/pools/:id/cancel", (req, res, next) =>
  transition(req, res, next, "CANCELLED")
);

// ---------------------------------------------------------------------------
// Shared pool details. Passenger self-service pool routes are not exposed;
// only an explicitly assigned passenger or the owning driver can read it.
// ---------------------------------------------------------------------------

export const membershipRouter = Router();
membershipRouter.use(requireAuth);

/** GET /pools/:id - members & seats (driver or assigned member only) */
membershipRouter.get("/pools/:id", async (req, res, next) => {
  try {
    const poolId = Number(req.params.id);
    if (!Number.isInteger(poolId) || poolId <= 0) {
      throw errors.notFound("Pool");
    }
    const pool = await prisma.pool.findUnique({
      where: { id: poolId },
      include: {
        vehicle: { include: { driver: { select: { id: true, name: true } } } },
        members: {
          include: {
            request: {
              include: {
                passenger: { select: { id: true, name: true } },
                pickupArea: true,
                destArea: true,
                fare: true,
              },
            },
          },
        },
        events: { orderBy: { at: "asc" } },
      },
    });
    if (!pool || pool.deletedAt) throw errors.notFound("Pool");

    const isDriver = pool.vehicle.driverId === req.user!.id;
    const isMember = pool.members.some(
      (m) => m.request.passengerId === req.user!.id
    );
    if (!isDriver && !isMember) throw errors.forbidden();

    // Roster is visible to everyone on the ride, but FARES are per-passenger only
    const members = pool.members.map((m) => ({
      requestId: m.requestId,
      passenger: m.request.passenger,
      pickup: m.request.pickupArea.name,
      dest: m.request.destArea.name,
      seats: m.seats,
      status: m.request.status,
      isMe: m.request.passengerId === req.user!.id,
      myFareTaka: m.request.passengerId === req.user!.id ? m.fareTaka : null,
      myFare: m.request.passengerId === req.user!.id ? m.request.fare : null,
    }));

    res.json({
      pool: {
        id: pool.id,
        status: pool.status,
        capacity: pool.capacity,
        seatsTaken: pool.seatsTaken,
        createdAt: pool.createdAt,
        startedAt: pool.startedAt,
        completedAt: pool.completedAt,
        vehicle: pool.vehicle.name,
        driver: pool.vehicle.driver,
        members,
        events: pool.events,
      },
    });
  } catch (e) {
    next(e);
  }
});
