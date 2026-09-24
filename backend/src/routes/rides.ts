import { Router } from "express";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { prisma, interactiveTransactionOptions } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { config } from "../config";
import { errors } from "../lib/errors";
import { computeFare } from "../lib/fare";
import { assertCancellable } from "../lib/transitions";

export const rideRouter = Router();

/** Keep the live board useful without turning it into an unbounded directory. */
const ACTIVITY_LIMIT = 20;

/**
 * A display token only. HMAC keeps a sequential request id from being exposed
 * or trivially guessed while remaining stable for a given deployment secret.
 */
function activityIdFor(requestId: number): string {
  const digest = createHmac("sha256", config.jwtSecret)
    .update(`ride-request:${requestId}`)
    .digest("hex")
    .slice(0, 16);
  return `act_${digest}`;
}

/** GET /areas - the predefined Dhaka zone list (no map API, PRD section 4) */
export const areaRouter = Router();
areaRouter.get("/areas", async (_req, res, next) => {
  try {
    const areas = await prisma.area.findMany({ orderBy: { name: "asc" } });
    res.json({ areas });
  } catch (e) {
    next(e);
  }
});

async function loadEnds(pickupAreaId: number, destAreaId: number) {
  const [pickup, dest] = await Promise.all([
    prisma.area.findUnique({ where: { id: pickupAreaId } }),
    prisma.area.findUnique({ where: { id: destAreaId } }),
  ]);
  if (!pickup || !dest) throw errors.notFound("Area");
  return { pickup, dest };
}

const requestSchema = z.object({
  pickupAreaId: z.number().int().positive(),
  destAreaId: z.number().int().positive(),
  seats: z.number().int().min(1).max(3).default(1),
});

/**
 * GET /rides/estimate?pickup=1&dest=4&seats=1&poolSize=1
 * Hand-testable breakdown - the evaluator can recompute this by hand.
 */
rideRouter.get("/estimate", async (req, res, next) => {
  try {
    const pickupAreaId = Number(req.query.pickup);
    const destAreaId = Number(req.query.dest);
    const seats = Number(req.query.seats ?? 1);
    const poolSize = Number(req.query.poolSize ?? 1);

    if (!Number.isInteger(pickupAreaId) || !Number.isInteger(destAreaId)) {
      throw errors.badRequest("pickup and dest must be area ids");
    }
    if (pickupAreaId === destAreaId) {
      throw errors.badRequest("Pickup and destination must differ");
    }
    if (!Number.isInteger(seats) || seats < 1 || seats > 3) {
      throw errors.badRequest("seats must be an integer from 1 to 3");
    }
    if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 3) {
      throw errors.badRequest("poolSize must be an integer from 1 to 3");
    }

    const ends = await loadEnds(pickupAreaId, destAreaId);
    const fare = computeFare({ ...ends, poolSize });

    res.json({
      pickup: ends.pickup.name,
      dest: ends.dest.name,
      seats,
      poolSize,
      currency: "BDT",
      unit: "Taka",
      ...fare,
    });
  } catch (e) {
    next(e);
  }
});

rideRouter.use(requireAuth, requireRole("passenger"));

/**
 * GET /rides/activity - a deliberately narrow, privacy-safe view of other
 * passengers' live REQUESTED rides. The current passenger is excluded, and the
 * response never selects identity, fare, status, pool, or history fields.
 */
rideRouter.get("/activity", async (req, res, next) => {
  try {
    const where = {
      status: "REQUESTED" as const,
      passengerId: { not: req.user!.id },
    };
    const [activeCount, rows] = await Promise.all([
      prisma.rideRequest.count({ where }),
      prisma.rideRequest.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: ACTIVITY_LIMIT,
        select: {
          id: true,
          seatsRequested: true,
          createdAt: true,
          pickupArea: { select: { name: true } },
          destArea: { select: { name: true } },
        },
      }),
    ]);

    res.set("Cache-Control", "private, no-store");
    res.json({
      activeCount,
      requests: rows.map((row) => ({
        activityId: activityIdFor(row.id),
        pickup: row.pickupArea.name,
        destination: row.destArea.name,
        seats: row.seatsRequested,
        createdAt: row.createdAt.toISOString(),
      })),
      refreshedAt: new Date().toISOString(),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /rides - passenger creates an unassigned request (status: REQUESTED).
 * This does not book a pool; only a later driver-owned mutation may assign it.
 */
rideRouter.post("/", async (req, res, next) => {
  try {
    const body = requestSchema.parse(req.body);

    if (body.pickupAreaId === body.destAreaId) {
      throw errors.badRequest("Pickup and destination must differ");
    }

    const ends = await loadEnds(body.pickupAreaId, body.destAreaId);
    const fare = computeFare({ ...ends, poolSize: 1 });

    const request = await prisma.rideRequest.create({
      data: {
        passengerId: req.user!.id,
        pickupAreaId: body.pickupAreaId,
        destAreaId: body.destAreaId,
        seatsRequested: body.seats,
        status: "REQUESTED",
        fare: {
          create: {
            baseTaka: fare.baseTaka,
            distanceTaka: fare.distanceTaka,
            discountTaka: 0,
            totalTaka: fare.totalTaka,
            distanceKm: fare.distanceKm,
          },
        },
      },
      include: {
        fare: true,
        pickupArea: true,
        destArea: true,
        poolMembers: { include: { pool: true } },
      },
    });
    const { poolMembers, ...ride } = request;

    // Keep every ride representation structurally identical: callers receive
    // `pool: null` immediately after creation instead of an unsound undefined.
    res.status(201).json({
      ride: { ...ride, pool: poolMembers[0]?.pool ?? null },
    });
  } catch (e) {
    next(e);
  }
});

/** GET /rides - MY history (never anyone else's) */
rideRouter.get("/", async (req, res, next) => {
  try {
    const rides = await prisma.rideRequest.findMany({
      where: { passengerId: req.user!.id },
      orderBy: { createdAt: "desc" },
      include: {
        fare: true,
        pickupArea: true,
        destArea: true,
        poolMembers: { include: { pool: true } },
      },
    });
    // The client contract exposes one membership (`pool`) rather than the raw
    // join-table array. It still contains no passenger other than the owner.
    res.json({
      rides: rides.map(({ poolMembers, ...ride }) => ({
        ...ride,
        pool: poolMembers[0]?.pool ?? null,
      })),
    });
  } catch (e) {
    next(e);
  }
});

/** GET /rides/:id - own ride only (other passengers' fares are never exposed) */
rideRouter.get("/:id", async (req, res, next) => {
  try {
    const ride = await prisma.rideRequest.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        fare: true,
        pickupArea: true,
        destArea: true,
        poolMembers: { include: { pool: true } },
      },
    });
    if (!ride) throw errors.notFound("Ride");
    if (ride.passengerId !== req.user!.id) throw errors.forbidden();

    res.json({
      ride: {
        ...ride,
        pool: ride.poolMembers[0]?.pool ?? null,
        poolMembers: undefined,
      },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * DELETE /rides/:id - cancel while valid (REQUESTED or MATCHED only).
 * Seats held by this passenger are released atomically.
 */
rideRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ride = await prisma.rideRequest.findUnique({ where: { id } });
    if (!ride) throw errors.notFound("Ride");
    if (ride.passengerId !== req.user!.id) throw errors.forbidden();

    assertCancellable(ride.status);

    await prisma.$transaction(async (tx) => {
      // Re-check the cancellable state in the write transaction. A driver can
      // advance the pool concurrently; if that won the race, the update count
      // is zero and the entire transaction rolls back without releasing a seat.
      const cancelled = await tx.rideRequest.updateMany({
        where: { id, status: { in: ["REQUESTED", "MATCHED"] } },
        data: { status: "CANCELLED" },
      });
      if (cancelled.count !== 1) {
        const current = await tx.rideRequest.findUnique({ where: { id } });
        throw errors.conflict(
          "CANCEL_NOT_ALLOWED",
          `Ride cannot be cancelled while ${current?.status ?? "UNKNOWN"}`
        );
      }

      const member = await tx.poolMember.findUnique({ where: { requestId: id } });
      if (member) {
        await tx.$executeRaw`
          UPDATE pools SET seats_taken = GREATEST(seats_taken - ${member.seats}, 0)
          WHERE id = ${member.poolId}`;
        await tx.poolMember.delete({ where: { id: member.id } });
        await tx.rideEvent.create({
          data: {
            poolId: member.poolId,
            actorId: req.user!.id,
            fromStatus: ride.status,
            toStatus: "CANCELLED",
            note: "Passenger cancelled and released their seats",
          },
        });
      }
    }, interactiveTransactionOptions);

    res.json({ ok: true, id, status: "CANCELLED" });
  } catch (e) {
    next(e);
  }
});
