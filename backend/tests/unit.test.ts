import { Prisma } from "@prisma/client";
import express from "express";
import request from "supertest";
import { describe, it, expect } from "vitest";
import { errorHandler } from "../src/middleware/error";
import { computeFare } from "../src/lib/fare";
import {
  assertPoolTransition,
  assertCancellable,
} from "../src/lib/transitions";
import {
  areCompatible,
  areOppositeDirections,
  areParallelRoutes,
  buildRoutePlan,
  canBuildContinuation,
} from "../src/lib/matching";

const banani = { lat: 23.7937, lng: 90.4066 };
const mohakhali = { lat: 23.7806, lng: 90.4074 };
const gulshan1 = { lat: 23.7925, lng: 90.4078 };
const dhanmondi = { lat: 23.7461, lng: 90.3742 };
const uttara = { lat: 23.8759, lng: 90.3795 };
const mirpur = { lat: 23.8069, lng: 90.3687 };
const farmgate = { lat: 23.7574, lng: 90.3885 };

describe("fare (pure, hand-testable)", () => {
  it("total = base + distance - discount, always whole Taka", () => {
    const f = computeFare({ pickup: banani, dest: mohakhali, poolSize: 1 });
    expect(f.baseTaka + f.distanceTaka - f.discountTaka).toBe(f.totalTaka);
    expect(Number.isInteger(f.totalTaka)).toBe(true);
    expect(f.discountTaka).toBe(0); // solo => no discount
  });

  it("pool discount applies only when poolSize >= 2", () => {
    const solo = computeFare({ pickup: banani, dest: mohakhali, poolSize: 1 });
    const duo = computeFare({ pickup: banani, dest: mohakhali, poolSize: 2 });
    expect(duo.discountTaka).toBeGreaterThan(0);
    expect(duo.totalTaka).toBeLessThan(solo.totalTaka);
    // hand-check: discount is exactly pct of subtotal
    expect(duo.baseTaka + duo.distanceTaka - duo.discountTaka).toBe(
      duo.totalTaka
    );
  });

  it("farther trip costs more", () => {
    const short = computeFare({ pickup: banani, dest: gulshan1, poolSize: 1 });
    const long = computeFare({ pickup: banani, dest: uttara, poolSize: 1 });
    expect(long.totalTaka).toBeGreaterThan(short.totalTaka);
  });
});

describe("state machine", () => {
  const legal: Array<[string, string]> = [
    ["REQUESTED", "MATCHED"],
    ["MATCHED", "DRIVER_ARRIVED"],
    ["DRIVER_ARRIVED", "STARTED"],
    ["STARTED", "COMPLETED"],
    ["REQUESTED", "CANCELLED"],
    ["MATCHED", "CANCELLED"],
  ];
  const illegal: Array<[string, string]> = [
    ["REQUESTED", "STARTED"],
    ["REQUESTED", "COMPLETED"],
    ["MATCHED", "STARTED"],
    ["COMPLETED", "STARTED"],
    ["CANCELLED", "MATCHED"],
    ["STARTED", "CANCELLED"],
  ];

  it.each(legal)("allows %s -> %s", (from, to) => {
    expect(() => assertPoolTransition(from, to)).not.toThrow();
  });

  it.each(illegal)("rejects %s -> %s", (from, to) => {
    expect(() => assertPoolTransition(from, to)).toThrowError(
      /Cannot move from/
    );
  });

  it("only REQUESTED/MATCHED are cancellable", () => {
    expect(() => assertCancellable("REQUESTED")).not.toThrow();
    expect(() => assertCancellable("MATCHED")).not.toThrow();
    expect(() => assertCancellable("STARTED")).toThrow();
    expect(() => assertCancellable("COMPLETED")).toThrow();
  });
});

describe("matching rule", () => {
  it("same pickup area pools (Nusrat & Rafiq story)", () => {
    expect(
      areCompatible(
        { pickup: banani, dest: mohakhali },
        { pickup: banani, dest: gulshan1 }
      )
    ).toBe(true);
  });

  it("same pickup remains compatible when final stops diverge", () => {
    expect(
      areCompatible(
        { pickup: banani, dest: mohakhali },
        { pickup: banani, dest: dhanmondi }
      )
    ).toBe(true);
  });

  it("rejects an exact reverse journey", () => {
    expect(
      areCompatible(
        { pickup: banani, dest: mohakhali },
        { pickup: mohakhali, dest: banani }
      )
    ).toBe(false);
  });

  it("rejects same-pickup journeys heading in opposite directions", () => {
    expect(
      areCompatible(
        { pickup: banani, dest: mohakhali },
        { pickup: banani, dest: uttara }
      )
    ).toBe(false);
  });

  it("allows a safe chained route when one pickup is the previous destination", () => {
    const firstLeg = { pickup: banani, dest: uttara };
    const secondLeg = { pickup: uttara, dest: mirpur };

    // The headings turn sharply at Uttara, but this is still one continuous
    // route rather than an opposite-direction pool.
    expect(areOppositeDirections(firstLeg, secondLeg)).toBe(true);
    expect(areCompatible(firstLeg, secondLeg)).toBe(true);
  });

  it("rejects a chained route that immediately returns to the previous origin", () => {
    expect(
      areCompatible(
        { pickup: banani, dest: uttara },
        { pickup: uttara, dest: banani }
      )
    ).toBe(false);
  });

  it("groups identical routes but not a later opposite branch", () => {
    const first = { pickup: banani, dest: uttara };
    const second = { pickup: banani, dest: uttara };
    const laterBranch = { pickup: banani, dest: farmgate };

    expect(areParallelRoutes(first, second)).toBe(true);
    expect(areCompatible(first, laterBranch)).toBe(false);
  });

  it("builds the oldest-first route plan from the driver point", () => {
    const first = {
      id: 1,
      createdAt: new Date("2026-01-01T10:00:00.000Z"),
      pickup: banani,
      dest: uttara,
    };
    const second = {
      id: 2,
      createdAt: new Date("2026-01-01T10:01:00.000Z"),
      pickup: uttara,
      dest: mirpur,
    };

    expect(buildRoutePlan([second, first], banani)?.map((route) => route.id)).toEqual([
      1, 2,
    ]);
  });

  it("does not reorder an active route when adding a continuation", () => {
    const active = { pickup: banani, dest: uttara };
    const continuation = { pickup: uttara, dest: mirpur };
    const branch = { pickup: banani, dest: farmgate };

    expect(canBuildContinuation([active], [continuation])).toBe(true);
    expect(canBuildContinuation([active], [branch])).toBe(false);
  });

  it("rejects genuinely unrelated faraway trips", () => {
    expect(
      areCompatible(
        { pickup: banani, dest: mohakhali },
        { pickup: dhanmondi, dest: mirpur }
      )
    ).toBe(false);
  });
});

describe("database error envelope", () => {
  it("returns a retryable response when a transaction times out", async () => {
    const app = express();
    app.get("/dispatch", () => {
      throw new Prisma.PrismaClientKnownRequestError("Transaction timed out", {
        code: "P2028",
        clientVersion: "6.19.3",
      });
    });
    app.use(errorHandler);

    const response = await request(app).get("/dispatch");

    expect(response.status).toBe(503);
    expect(response.headers["retry-after"]).toBe("2");
    expect(response.body.error).toEqual({
      code: "TRANSACTION_TIMEOUT",
      message: "The database is busy. The action was not saved; please retry.",
    });
  });
});
