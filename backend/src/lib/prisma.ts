import { PrismaClient } from "@prisma/client";

/**
 * Serverless + managed Postgres can legitimately spend several seconds opening
 * a connection and running the short, serial queries used by our interactive
 * transactions. Prisma's 5-second default is too aggressive for production
 * dispatch operations on cold Neon instances.
 */
export const interactiveTransactionOptions = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

/** Single Prisma client reused across the process (connection pool). */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
