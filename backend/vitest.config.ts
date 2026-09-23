import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
    // DB-backed tests share one Postgres - run files sequentially to avoid
    // table-reset races between suites.
    fileParallelism: false,
  },
});
