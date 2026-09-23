import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { errors } from "../lib/errors";
import { computeFare } from "../lib/fare";
import { areCompatible } from "../lib/matching";
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

async function claimSeats(poolId: number, seats: number): Promise<boolean> {
  return claimSeatsTx(prisma, poolId, seats);
}

/** Same statement, in reverse - used on cancel/removal. */
async function releaseSeats(poolId: number, seats: number) {
  await prisma.$executeRaw`
    UPDATE pools
       SET seats_taken = GREATEST(seats_taken - ${seats}, 0)
     WHERE id = ${poolId}`;
}

/** Recompute every member's individual fare after membership changes. */
async function recalcFares(poolId: number) {
  const pool = await prisma.pool.findUnique({
    where: { id: poolId },
    include: {
      members: {
        include: {
          request: { include: { pickupArea: true, destArea: true, fare: true } },
        },
      },
    },
  });
  if (!pool || pool.members.length === 0) return;

  const poolSize = pool.members.length;
  for (const m of pool.members) {
    const fare = computeFare({
      pickup: { lat: m.request.pickupArea.lat, lng: m.request.pickupArea.lng },
      dest: { lat: m.request.destArea.lat, lng: m.request.destArea.lng },
      poolSize,
    });

    if (m.request.fare) {
      await prisma.fare.update({
        where: { id: m.request.fare.id },
        data: {
          discountTaka: fare.discountTaka,
          totalTaka: fare.totalTaka,
          distanceKm: fare.distanceKm,
        },
      });
    }
    await prisma.poolMember.update({
      where: { id: m.id },
      data: { fareTaka: fare.totalTaka },
    });
  }
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

const joinSchema = z.object({ requestId: z.number().int().positive() });
const openPoolSchema = z.object({
  requestIds: z.array(z.number().int().positive()).min(1),
});

// ---------------------------------------------------------------------------
// Driver endpoints
// ---------------------------------------------------------------------------

export const driverRouter = Router();
driverRouter.use(requireAuth, requireRole("driver"));

/** GET /driver/requests - relevant REQUESTED rides + this driver's vehicle */
driverRouter.get("/requests", async (req, res, next) => {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { driverId: req.user!.id },
    });
    if (!vehicle) throw errors.notFound("Vehicle");

    const open = await prisma.rideRequest.findMany({
      where: { status: "REQUESTED" },
      include: {
        passenger: { select: { id: true, name: true } },
        pickupArea: true,
        destArea: true,
        fare: true,
      },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      vehicle: {
        id: vehicle.id,
        name: vehicle.name,
        capacity: vehicle.capacity,
        isOnline: vehicle.isOnline,
      },
      requests: open.map((r) => ({
        id: r.id,
        passenger: r.passenger,
        pickup: r.pickupArea.name,
        dest: r.destArea.name,
        seats: r.seatsRequested,
        status: r.status,
        estimatedFareTaka: r.fare?.totalTaka ?? null,
        createdAt: r.createdAt,
      })),
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
 * POST /driver/pools - open a pool with one or more requests.
 * Capacity is enforced atomically; over-capacity => 409 NO_SEATS.
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

    // same-corridor rule must hold for everyone in this pool
    const head = requests[0];
    for (const r of requests.slice(1)) {
      const ok = areCompatible(
        {
          pickup: { lat: head.pickupArea.lat, lng: head.pickupArea.lng },
          dest: { lat: head.destArea.lat, lng: head.destArea.lng },
        },
        {
          pickup: { lat: r.pickupArea.lat, lng: r.pickupArea.lng },
          dest: { lat: r.destArea.lat, lng: r.destArea.lng },
        }
      );
      if (!ok) {
        throw errors.conflict(
          "INCOMPATIBLE",
          "These trips cannot share a Tesla (matching rule)"
        );
      }
    }

    const totalSeats = requests.reduce((s, r) => s + r.seatsRequested, 0);
    if (totalSeats > vehicle.capacity) throw errors.noSeats();

    const pool = await prisma.$transaction(async (tx) => {
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
          note: `Pool opened with ${requests.length} request(s)`,
        },
      });

      return p;
    });

    await recalcFares(pool.id);
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

/** Lifecycle helper - guarded transition + mirrored status + audit event. */
async function transition(req: any, res: any, next: any, to: string) {
  try {
    const pool = await guardPool(Number(req.params.id));
    assertDriverOwns(pool.vehicle.driverId, req.user!.id);
    assertPoolTransition(pool.status, to);

    await prisma.$transaction(async (tx) => {
      await tx.pool.update({
        where: { id: pool.id },
        data: {
          status: to as any,
          ...(to === "STARTED" ? { startedAt: new Date() } : {}),
          ...(to === "COMPLETED" ? { completedAt: new Date() } : {}),
        },
      });
      // mirror status to every member's ride so passengers track their own status
      await tx.rideRequest.updateMany({
        where: { poolMembers: { some: { poolId: pool.id } } },
        data: { status: to as any },
      });
      await tx.rideEvent.create({
        data: {
          poolId: pool.id,
          actorId: req.user!.id,
          fromStatus: pool.status,
          toStatus: to,
        },
      });
    });

    await recalcFares(pool.id);
    res.json({ poolId: pool.id, status: to });
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
// Shared pool endpoints (membership) - both roles allowed
// ---------------------------------------------------------------------------

export const membershipRouter = Router();
membershipRouter.use(requireAuth);

/**
 * POST /pools/:id/join - a PASSENGER joins an open pool with their own request.
 * Same atomic claim as the driver path.
 */
membershipRouter.post("/pools/:id/join", async (req, res, next) => {
  try {
    const { requestId } = joinSchema.parse(req.body);
    const poolId = Number(req.params.id);
    const pool = await guardPool(poolId);

    const request = await prisma.rideRequest.findUnique({
      where: { id: requestId },
      include: { pickupArea: true, destArea: true },
    });
    if (!request) throw errors.notFound("Ride");
    if (request.passengerId !== req.user!.id) {
      throw errors.forbidden("You can only join with your own request");
    }
    if (request.status !== "REQUESTED") {
      throw errors.conflict("REQUEST_UNAVAILABLE", "Ride is not joinable anymore");
    }
    if (pool.status !== "REQUESTED" && pool.status !== "MATCHED") {
      throw errors.conflict("POOL_CLOSED", "Pool is not accepting passengers");
    }

    // matching rule against an existing member
    const existing = await prisma.poolMember.findFirst({
      where: { poolId },
      include: { request: { include: { pickupArea: true, destArea: true } } },
    });
    if (existing) {
      const ok = areCompatible(
        {
          pickup: {
            lat: existing.request.pickupArea.lat,
            lng: existing.request.pickupArea.lng,
          },
          dest: {
            lat: existing.request.destArea.lat,
            lng: existing.request.destArea.lng,
          },
        },
        {
          pickup: { lat: request.pickupArea.lat, lng: request.pickupArea.lng },
          dest: { lat: request.destArea.lat, lng: request.destArea.lng },
        }
      );
      if (!ok) {
        throw errors.conflict("INCOMPATIBLE", "Trips do not overlap enough to pool");
      }
    }

    // ⭐ atomic - the Nusrat/Shirin last-seat race resolves right here
    const ok = await claimSeats(poolId, request.seatsRequested);
    if (!ok) throw errors.noSeats();

    await prisma.$transaction([
      prisma.poolMember.create({
        data: {
          poolId,
          requestId,
          seats: request.seatsRequested,
          fareTaka: 0,
        },
      }),
      prisma.rideRequest.update({
        where: { id: requestId },
        data: { status: "MATCHED" },
      }),
      prisma.rideEvent.create({
        data: {
          poolId,
          actorId: req.user!.id,
          fromStatus: "REQUESTED",
          toStatus: "MATCHED",
          note: "Passenger joined pool",
        },
      }),
    ]);

    await recalcFares(poolId);

    const fresh = await prisma.pool.findUnique({ where: { id: poolId } });
    res.status(201).json({ ok: true, poolId, seatsTaken: fresh?.seatsTaken });
  } catch (e) {
    next(e);
  }
});

/** GET /pools/:id - members & seats (driver or member only) */
membershipRouter.get("/pools/:id", async (req, res, next) => {
  try {
    const pool = await prisma.pool.findUnique({
      where: { id: Number(req.params.id) },
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

export { releaseSeats, claimSeats, recalcFares };
