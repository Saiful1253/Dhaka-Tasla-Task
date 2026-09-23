import { config } from "../config";
import { haversineKm } from "./geo";

export interface FareBreakdown {
  distanceKm: number;
  baseTaka: number;
  distanceTaka: number;
  discountTaka: number;
  totalTaka: number;
}

/**
 * passengerFare = baseFare + distanceCharge - poolDiscount
 *
 * - Everything is stored as whole Taka. No fractional values in storage:
 *   money must be exact and hand-verifiable.
 * - poolDiscount applies only when the pool actually carries >= 2 passengers.
 * - distance = Haversine between area centers (documented, deterministic).
 */
export function computeFare(opts: {
  pickup: { lat: number; lng: number };
  dest: { lat: number; lng: number };
  poolSize: number;
}): FareBreakdown {
  const { baseFareTaka, ratePerKmTaka, poolDiscountPct } = config.fare;

  const distanceKm = haversineKm(
    opts.pickup.lat,
    opts.pickup.lng,
    opts.dest.lat,
    opts.dest.lng
  );
  const distanceTaka = Math.round(distanceKm * ratePerKmTaka);
  const subtotal = baseFareTaka + distanceTaka;

  const discountTaka =
    opts.poolSize >= 2 ? Math.round((subtotal * poolDiscountPct) / 100) : 0;

  return {
    distanceKm: Number(distanceKm.toFixed(3)),
    baseTaka: baseFareTaka,
    distanceTaka,
    discountTaka,
    totalTaka: subtotal - discountTaka,
  };
}
