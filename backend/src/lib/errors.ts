/**
 * Typed application errors.
 * Every error response has the same envelope: { error: { code, message } }
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errors = {
  unauthorized: () =>
    new AppError(401, "UNAUTHORIZED", "Authentication required"),
  invalidCredentials: () =>
    new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect"),
  forbidden: (msg = "You do not own this resource") =>
    new AppError(403, "FORBIDDEN", msg),
  notFound: (what = "Resource") =>
    new AppError(404, "NOT_FOUND", `${what} not found`),
  conflict: (code: string, msg: string) => new AppError(409, code, msg),
  noSeats: () => new AppError(409, "NO_SEATS", "No seats available in this pool"),
  invalidTransition: (from: string, to: string) =>
    new AppError(
      409,
      "INVALID_TRANSITION",
      `Cannot move from ${from} to ${to}`
    ),
  badRequest: (msg: string) => new AppError(400, "BAD_REQUEST", msg),
};
