import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { errors } from "../lib/errors";
import { computeFare } from "../lib/fare";
import { areCompatible } from "../lib/matching";
import { assertCancellable } from "../lib/transitions";

export const rideRouter = Router();

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

rideRouter.use(requireAuth);

/** POST /rides - passenger requests a ride (status: REQUESTED) */
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
      include: { fare: true, pickupArea: true, destArea: true },
    });

    res.status(201).json({ ride: request });
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
    res.json({ rides });
  } catch (e) {
    next(e);
  }
});

/** GET /rides/:id/matches - compatible REQUESTED rides (the matching rule) */
rideRouter.get("/:id/matches", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const mine = await prisma.rideRequest.findUnique({
      where: { id },
      include: { pickupArea: true, destArea: true },
    });
    if (!mine) throw errors.notFound("Ride");
    if (mine.passengerId !== req.user!.id) throw errors.forbidden();

    const mineEnds = {
      pickup: { lat: mine.pickupArea.lat, lng: mine.pickupArea.lng },
      dest: { lat: mine.destArea.lat, lng: mine.destArea.lng },
    };

    const others = await prisma.rideRequest.findMany({
      where: { status: "REQUESTED", id: { not: mine.id } },
      include: {
        passenger: { select: { id: true, name: true } },
        pickupArea: true,
        destArea: true,
      },
    });

    const matches = others
      .filter((o) =>
        areCompatible(mineEnds, {
          pickup: { lat: o.pickupArea.lat, lng: o.pickupArea.lng },
          dest: { lat: o.destArea.lat, lng: o.destArea.lng },
        })
      )
      .map((o) => ({
        id: o.id,
        passenger: o.passenger,
        pickup: o.pickupArea.name,
        dest: o.destArea.name,
        seats: o.seatsRequested,
      }));

    res.json({ matches });
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
    const ride = await prisma.rideRequest.findUnique({
      where: { id },
      include: { poolMembers: true },
    });
    if (!ride) throw errors.notFound("Ride");
    if (ride.passengerId !== req.user!.id) throw errors.forbidden();

    assertCancellable(ride.status);

    await prisma.$transaction(async (tx) => {
      const member = ride.poolMembers[0];
      if (member) {
        await tx.$executeRaw`
          UPDATE pools SET seats_taken = GREATEST(seats_taken - ${member.seats}, 0)
          WHERE id = ${member.poolId}`;
        await tx.poolMember.delete({ where: { id: member.id } });
      }
      await tx.rideRequest.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
    });

    res.json({ ok: true, id, status: "CANCELLED" });
  } catch (e) {
    next(e);
  }
});
