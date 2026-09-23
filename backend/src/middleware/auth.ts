import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { errors } from "../lib/errors";

export interface AuthUser {
  id: number;
  role: "passenger" | "driver";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
  );
}

/** Requires a valid Bearer token; attaches req.user. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(errors.unauthorized());

  try {
    const payload = jwt.verify(
      header.slice(7),
      config.jwtSecret
    ) as jwt.JwtPayload;
    req.user = {
      id: Number(payload.sub),
      role: payload.role as AuthUser["role"],
    };
    next();
  } catch {
    next(errors.unauthorized());
  }
}

/** Role gate - use AFTER requireAuth. */
export function requireRole(role: AuthUser["role"]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(errors.unauthorized());
    if (req.user.role !== role) {
      return next(errors.forbidden(`Only ${role}s can do this`));
    }
    next();
  };
}
