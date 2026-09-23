import { config } from "../config";
import { haversineKm } from "./geo";

export interface FareBreakdown {
  distanceKm: number;
  basePaisa: number;
  distancePaisa: number;
  discountPaisa: number;
  totalPaisa: number;
}

/**
 * passengerFare = baseFare + distanceCharge - poolDiscount
 *
 * - Everything is INTEGER PAISA (1 taka = 100 paisa). No floats in storage:
 *   money must be exact and hand-verifiable.
 * - poolDiscount applies only when the pool actually carries >= 2 passengers.
 * - distance = Haversine between area centers (documented, deterministic).
 */
export function computeFare(opts: {
  pickup: { lat: number; lng: number };
  dest: { lat: number; lng: number };
  poolSize: number;
}): FareBreakdown {
  const { baseFarePaisa, ratePerKmPaisa, poolDiscountPct } = config.fare;

  const distanceKm = haversineKm(
    opts.pickup.lat,
    opts.pickup.lng,
    opts.dest.lat,
    opts.dest.lng
  );
  const distancePaisa = Math.round(distanceKm * ratePerKmPaisa);
  const subtotal = baseFarePaisa + distancePaisa;

  const discountPaisa =
    opts.poolSize >= 2 ? Math.round((subtotal * poolDiscountPct) / 100) : 0;

  return {
    distanceKm: Number(distanceKm.toFixed(3)),
    basePaisa: baseFarePaisa,
    distancePaisa,
    discountPaisa,
    totalPaisa: subtotal - discountPaisa,
  };
}
