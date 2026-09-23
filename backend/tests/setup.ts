import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * Wipe all data between tests. Order matters (FKs).
 * Truncating instead of deleting keeps sequences predictable.
 */
export async function resetDb() {
  const tables = [
    "payments",
    "fares",
    "ride_events",
    "pool_members",
    "ride_requests",
    "pools",
    "vehicles",
    "users",
    "areas",
  ];
  for (const t of tables) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`
    );
  }
}

export async function closeDb() {
  await prisma.$disconnect();
}
