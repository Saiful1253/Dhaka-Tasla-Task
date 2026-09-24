import { PrismaClient } from "@prisma/client";

function assertDisposableTestDatabase() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error("DATABASE_URL is required for backend integration tests");
  }

  let databaseName = "";
  try {
    databaseName = decodeURIComponent(new URL(rawUrl).pathname.replace(/^\//, ""));
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL");
  }

  const explicitlyAllowed = process.env.ALLOW_DESTRUCTIVE_DB_TESTS === "true";
  const disposableName = /(^|[_-])test([_-]|$)/i.test(databaseName);
  if (!explicitlyAllowed || !disposableName) {
    throw new Error(
      `Refusing destructive tests against database "${databaseName}". ` +
        "Use a database whose name contains 'test' and set " +
        "ALLOW_DESTRUCTIVE_DB_TESTS=true. The Docker test stack does this automatically.",
    );
  }
}

assertDisposableTestDatabase();

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
