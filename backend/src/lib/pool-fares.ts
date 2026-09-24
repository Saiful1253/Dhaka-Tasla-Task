import type { Prisma } from "@prisma/client";

import { computeFare } from "./fare";

/**
 * Recalculate every member's persisted fare from the current pool membership.
 *
 * Pool size is the number of passenger requests, not the number of held seats.
 * Callers must invoke this inside the same transaction that changes membership
 * so a cancellation or assignment cannot leave stale totals behind.
 */
export async function recalculatePoolFaresTx(
  tx: Prisma.TransactionClient,
  poolId: number
): Promise<void> {
  const pool = await tx.pool.findUnique({
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
  for (const member of pool.members) {
    const fare = computeFare({
      pickup: {
        lat: member.request.pickupArea.lat,
        lng: member.request.pickupArea.lng,
      },
      dest: { lat: member.request.destArea.lat, lng: member.request.destArea.lng },
      poolSize,
    });

    if (member.request.fare) {
      await tx.fare.update({
        where: { id: member.request.fare.id },
        data: {
          baseTaka: fare.baseTaka,
          distanceTaka: fare.distanceTaka,
          discountTaka: fare.discountTaka,
          totalTaka: fare.totalTaka,
          distanceKm: fare.distanceKm,
        },
      });
    }
    await tx.poolMember.update({
      where: { id: member.id },
      data: { fareTaka: fare.totalTaka },
    });
  }
}
