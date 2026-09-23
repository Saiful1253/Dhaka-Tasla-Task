import { errors } from "./errors";

/**
 * SINGLE SOURCE OF TRUTH for ride/pool state transitions.
 * Validated server-side on every status change - a UI cannot bypass it.
 * Anything not listed => 409 INVALID_TRANSITION.
 */
export const POOL_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ["MATCHED", "CANCELLED"],
  MATCHED: ["DRIVER_ARRIVED", "CANCELLED"],
  DRIVER_ARRIVED: ["STARTED"],
  STARTED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** Passenger-facing status mirrors the pool, but a lone request can only be cancelled. */
export const REQUEST_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ["MATCHED", "CANCELLED"],
  MATCHED: ["DRIVER_ARRIVED", "STARTED", "COMPLETED", "CANCELLED"],
  DRIVER_ARRIVED: ["STARTED", "CANCELLED"],
  STARTED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertPoolTransition(from: string, to: string): void {
  const allowed = POOL_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw errors.invalidTransition(from, to);
  }
}

export function assertRequestTransition(from: string, to: string): void {
  const allowed = REQUEST_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw errors.invalidTransition(from, to);
  }
}

/** Only these states may be cancelled (PRD: "cancel while valid"). */
export function assertCancellable(status: string): void {
  if (status !== "REQUESTED" && status !== "MATCHED") {
    throw errors.conflict(
      "CANCEL_NOT_ALLOWED",
      `Ride cannot be cancelled while ${status}`
    );
  }
}
