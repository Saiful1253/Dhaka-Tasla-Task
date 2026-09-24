import { config } from "../config";
import { haversineKm } from "./geo";

export interface TripEnds {
  pickup: { lat: number; lng: number };
  dest: { lat: number; lng: number };
}

/**
 * MATCHING RULE (documented + applied consistently, PRD section 4):
 *
 *   Two ride requests may share a Tesla if EITHER
 *     (a) they have the same pickup area, OR
 *     (b) their pickups are within `pickupRadiusKm` AND their destinations
 *         are within `destRadiusKm` (overlapping-but-not-identical routes).
 *
 * Story check: Nusrat (Banani→Mohakhali) and Rafiq (Banani→Gulshan 1) share
 * pickup area Banani => compatible. Shirin (Banani→Dhanmondi) also shares the
 * pickup area, but is bounded by Bullet's remaining seats.
 */
export function areCompatible(a: TripEnds, b: TripEnds): boolean {
  const { pickupRadiusKm, destRadiusKm } = config.matching;

  // (a) identical pickup point (same predefined area center). This deliberately
  // keeps the Banani pickup story compatible even when final stops diverge.
  if (
    a.pickup.lat === b.pickup.lat &&
    a.pickup.lng === b.pickup.lng
  ) {
    return true;
  }

  // (b) nearby pickups AND nearby destinations
  const pickupDist = haversineKm(
    a.pickup.lat,
    a.pickup.lng,
    b.pickup.lat,
    b.pickup.lng
  );
  const destDist = haversineKm(a.dest.lat, a.dest.lng, b.dest.lat, b.dest.lng);

  return pickupDist <= pickupRadiusKm && destDist <= destRadiusKm;
}
