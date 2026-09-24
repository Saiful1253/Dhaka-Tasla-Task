import { config } from "../config";
import { haversineKm } from "./geo";

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface TripEnds {
  pickup: RoutePoint;
  dest: RoutePoint;
}

/** Metadata is optional so the matcher stays easy to use in pure unit tests. */
export interface RoutePlanRequest extends TripEnds {
  id?: number;
  createdAt?: Date;
}

const MIN_DIRECTION_VECTOR_LENGTH = 1e-9;

function routeVector(trip: TripEnds): RoutePoint {
  // A local equirectangular projection is sufficient for Dhaka's small area
  // and avoids introducing a map/routing dependency.
  const midpointLat =
    ((trip.pickup.lat + trip.dest.lat) / 2) * (Math.PI / 180);
  return {
    lat: trip.dest.lat - trip.pickup.lat,
    lng: (trip.dest.lng - trip.pickup.lng) * Math.cos(midpointLat),
  };
}

function directionAngleDifference(a: TripEnds, b: TripEnds): number {
  const first = routeVector(a);
  const second = routeVector(b);
  const firstLength = Math.hypot(first.lng, first.lat);
  const secondLength = Math.hypot(second.lng, second.lat);

  // There is no reliable heading for a zero-length route. Ride validation
  // normally prevents this, but treating it as non-opposite keeps the matcher
  // safe for malformed or legacy data.
  if (
    firstLength < MIN_DIRECTION_VECTOR_LENGTH ||
    secondLength < MIN_DIRECTION_VECTOR_LENGTH
  ) {
    return 0;
  }

  const firstAngle = Math.atan2(first.lat, first.lng);
  const secondAngle = Math.atan2(second.lat, second.lng);
  const difference =
    Math.abs(firstAngle - secondAngle) * (180 / Math.PI);
  return Math.min(difference, 360 - difference);
}

function pointDistance(a: RoutePoint, b: RoutePoint): number {
  return haversineKm(a.lat, a.lng, b.lat, b.lng);
}

function samePickup(a: TripEnds, b: TripEnds): boolean {
  return a.pickup.lat === b.pickup.lat && a.pickup.lng === b.pickup.lng;
}

export function areOppositeDirections(a: TripEnds, b: TripEnds): boolean {
  return (
    directionAngleDifference(a, b) >= config.matching.oppositeDirectionAngleDeg
  );
}

/**
 * A safe handoff is the important new case:
 *
 *   Banani -> Uttara, then Uttara -> Mirpur
 *
 * The two route headings can differ sharply at the handoff, but the second
 * pickup is exactly where the first route ends. We allow that turn while
 * rejecting a route that immediately returns to the previous pickup.
 */
function isSafeHandoff(previous: TripEnds, next: TripEnds): boolean {
  const handoffDistance = pointDistance(previous.dest, next.pickup);
  if (handoffDistance > config.matching.routeHandoffRadiusKm) return false;

  // Do not turn a chain into an immediate backtrack. Reject both
  // Banani -> Mohakhali followed by Banani -> Uttara (same starting point)
  // and Banani -> Uttara followed by Uttara -> Banani (return to the origin).
  const startsAtPreviousOrigin = pointDistance(
    previous.pickup,
    next.pickup
  );
  const returnsToPreviousOrigin = pointDistance(
    previous.pickup,
    next.dest
  );
  return (
    startsAtPreviousOrigin > config.matching.routeHandoffRadiusKm &&
    returnsToPreviousOrigin > config.matching.routeHandoffRadiusKm
  );
}

/** True when two requests can travel together on the same leg. */
export function areParallelRoutes(a: TripEnds, b: TripEnds): boolean {
  if (areOppositeDirections(a, b)) return false;
  return (
    pointDistance(a.pickup, b.pickup) <= config.matching.pickupRadiusKm &&
    pointDistance(a.dest, b.dest) <= config.matching.destRadiusKm
  );
}

/**
 * Two requests are compatible when they can share one ordered route plan:
 *   - they travel on the same/overlapping leg, or
 *   - one starts where the other ends (a safe handoff).
 *
 * The old same-pickup exception remains for non-opposite trips so existing
 * corridor sharing remains deterministic. The ordered-plan check below is the
 * final authority when several requests are assigned together.
 */
export function areCompatible(a: TripEnds, b: TripEnds): boolean {
  if (isSafeHandoff(a, b) || isSafeHandoff(b, a)) return true;
  if (areOppositeDirections(a, b)) return false;
  if (samePickup(a, b)) return true;
  return areParallelRoutes(a, b);
}

function routeTimestamp(route: RoutePlanRequest): number | null {
  if (!route.createdAt) return null;
  const value =
    route.createdAt instanceof Date
      ? route.createdAt.getTime()
      : new Date(route.createdAt).getTime();
  return Number.isFinite(value) ? value : null;
}

function compareRoutePriority(
  first: { route: RoutePlanRequest; index: number },
  second: { route: RoutePlanRequest; index: number },
): number {
  const firstTime = routeTimestamp(first.route);
  const secondTime = routeTimestamp(second.route);
  if (firstTime !== null && secondTime !== null && firstTime !== secondTime) {
    return firstTime - secondTime;
  }
  if (typeof first.route.id === "number" && typeof second.route.id === "number") {
    return first.route.id - second.route.id;
  }
  return first.index - second.index;
}

/**
 * Find a valid order for a set of routes. Routes are tried oldest-first, so a
 * route plan naturally anchors on the first request while still allowing a
 * later request to continue from an earlier destination.
 *
 * The search is small because a vehicle pool has a small seat capacity. It
 * avoids making a greedy choice that could strand a valid chain.
 */
export function buildRoutePlan<T extends RoutePlanRequest>(
  routes: T[],
  start?: RoutePoint,
): T[] | null {
  if (routes.length === 0) return [];

  const prepared = routes
    .map((route, index) => ({ route, index }))
    .sort(compareRoutePriority);
  const memo = new Set<string>();

  function search(
    remaining: Array<{ route: T; index: number }>,
    previousIndex: number | null,
  ): T[] | null {
    if (remaining.length === 0) return [];

    const key = `${previousIndex ?? "start"}:${remaining
      .map((candidate) => candidate.index)
      .join(",")}`;
    if (memo.has(key)) return null;

    for (const candidate of remaining) {
      if (
        previousIndex !== null &&
        !areCompatible(prepared[previousIndex].route, candidate.route)
      ) {
        continue;
      }
      if (
        previousIndex === null &&
        start &&
        pointDistance(start, candidate.route.pickup) > config.matching.pickupRadiusKm
      ) {
        continue;
      }

      const nextRemaining = remaining.filter(
        (other) => other.index !== candidate.index
      );
      const tail = search(nextRemaining, candidate.index);
      if (tail) return [candidate.route, ...tail];
    }

    memo.add(key);
    return null;
  }

  return search(prepared, null);
}

export function canBuildRoutePlan(
  routes: RoutePlanRequest[],
  start?: RoutePoint,
): boolean {
  return buildRoutePlan(routes, start) !== null;
}

/**
 * Validate additions after an already dispatched route. Existing members stay
 * in their original order; a new request may join the current leg or continue
 * from the final destination, but it cannot reorder the driver's trip.
 */
export function canBuildContinuation<T extends RoutePlanRequest>(
  existing: T[],
  additions: T[],
): boolean {
  if (additions.length === 0) return true;
  if (existing.length === 0) return buildRoutePlan(additions) !== null;

  const previous = existing[existing.length - 1];
  const ordered = additions
    .map((route, index) => ({ route, index }))
    .sort(compareRoutePriority);

  function search(
    remaining: Array<{ route: T; index: number }>,
    last: T,
  ): boolean {
    if (remaining.length === 0) return true;
    for (const candidate of remaining) {
      if (!areCompatible(last, candidate.route)) continue;
      const nextRemaining = remaining.filter(
        (other) => other.index !== candidate.index
      );
      if (search(nextRemaining, candidate.route)) return true;
    }
    return false;
  }

  return search(ordered, previous);
}
