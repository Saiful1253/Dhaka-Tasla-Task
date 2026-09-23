import { describe, it, expect } from "vitest";
import { computeFare } from "../src/lib/fare";
import {
  assertPoolTransition,
  assertCancellable,
} from "../src/lib/transitions";
import { areCompatible } from "../src/lib/matching";

const banani = { lat: 23.7937, lng: 90.4066 };
const mohakhali = { lat: 23.7806, lng: 90.4074 };
const gulshan1 = { lat: 23.7925, lng: 90.4078 };
const uttara = { lat: 23.8759, lng: 90.3795 };

describe("fare (pure, hand-testable)", () => {
  it("total = base + distance - discount, always integer paisa", () => {
    const f = computeFare({ pickup: banani, dest: mohakhali, poolSize: 1 });
    expect(f.basePaisa + f.distancePaisa - f.discountPaisa).toBe(f.totalPaisa);
    expect(Number.isInteger(f.totalPaisa)).toBe(true);
    expect(f.discountPaisa).toBe(0); // solo => no discount
  });

  it("pool discount applies only when poolSize >= 2", () => {
    const solo = computeFare({ pickup: banani, dest: mohakhali, poolSize: 1 });
    const duo = computeFare({ pickup: banani, dest: mohakhali, poolSize: 2 });
    expect(duo.discountPaisa).toBeGreaterThan(0);
    expect(duo.totalPaisa).toBeLessThan(solo.totalPaisa);
    // hand-check: discount is exactly pct of subtotal
    expect(duo.basePaisa + duo.distancePaisa - duo.discountPaisa).toBe(
      duo.totalPaisa
    );
  });

  it("farther trip costs more", () => {
    const short = computeFare({ pickup: banani, dest: gulshan1, poolSize: 1 });
    const long = computeFare({ pickup: banani, dest: uttara, poolSize: 1 });
    expect(long.totalPaisa).toBeGreaterThan(short.totalPaisa);
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

  it("faraway trips do not pool (Uttara vs Banani)", () => {
    expect(
      areCompatible(
        { pickup: banani, dest: mohakhali },
        { pickup: uttara, dest: gulshan1 }
      )
    ).toBe(false);
  });
});
