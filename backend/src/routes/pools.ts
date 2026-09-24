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
  const pool = await prisma.pool.findUnique({
    where: { id: poolId },
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
        where: { status: "REQUESTED" },
        include: {
          passenger: { select: { id: true, name: true } },
          pickupArea: true,
          destArea: true,
          fare: true,
        },
        orderBy: { createdAt: "asc" },
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

    res.json({
      vehicle: {
        id: vehicle.id,
        name: vehicle.name,
        capacity: vehicle.capacity,
        isOnline: vehicle.isOnline,
      },
      requests: open.map((r) => {
        const fitsActivePool = activePool
          ? requestsShareCorridor([...activeRoutes, r])
          : null;
        return {
          id: r.id,
          passenger: r.passenger,
          pickup: r.pickupArea.name,
          dest: r.destArea.name,
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
      data: { isOnline: !vehicle.isOnline },
    });
    res.json({ isOnline: updated.isOnline });
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
        "These trips cannot share a Tesla (matching rule)"
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
      where: { vehicle: { driverId: req.user!.id } },
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
        where: { id: { in: requestIds }, status: "REQUESTED" },
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
        "One or more trips do not fit this pool's corridor"
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
    if (!pool) throw errors.notFound("Pool");

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
