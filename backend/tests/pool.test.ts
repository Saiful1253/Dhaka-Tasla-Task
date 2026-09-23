import request from "supertest";
import bcrypt from "bcryptjs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApp } from "../src/app";
import { prisma, resetDb, closeDb } from "./setup";
import { computeFare } from "../src/lib/fare";

const app = createApp();

/**
 * The story cast (PRD section 18) - never user1/driver1.
 * Jashim + Bullet (3 seats); Nusrat, Rafiq, Shirin ride.
 */
let jashimToken = "";
let nusratToken = "";
let rafiqToken = "";
let shirinToken = "";
let nusratId = 0;
let rafiqId = 0;
let shirinId = 0;

let bananiId = 0;
let mohakhaliId = 0;
let gulshan1Id = 0;
let dhanmondiId = 0;
let mirpurId = 0;
let uttaraId = 0;

async function login(email: string): Promise<string> {
  const res = await request(app)
    .post("/auth/login")
    .send({ email, password: "tesla123" });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function makeRide(
  token: string,
  pickup: number,
  dest: number,
  seats = 1
) {
  const res = await request(app)
    .post("/rides")
    .set("Authorization", `Bearer ${token}`)
    .send({ pickupAreaId: pickup, destAreaId: dest, seats });
  expect(res.status).toBe(201);
  return res.body.ride as { id: number };
}

beforeAll(async () => {
  await resetDb();

  const hash = await bcrypt.hash("tesla123", 10);
  const jashim = await prisma.user.create({
    data: { name: "Jashim", email: "jashim@test.bd", passwordHash: hash, role: "driver" },
  });
  await prisma.vehicle.create({
    data: { driverId: jashim.id, name: "Bullet", capacity: 3, isOnline: true },
  });

  const mkPassenger = (name: string, email: string) =>
    prisma.user.create({
      data: { name, email, passwordHash: hash, role: "passenger" },
    });

  const nusrat = await mkPassenger("Nusrat", "nusrat@test.bd");
  const rafiq = await mkPassenger("Rafiq", "rafiq@test.bd");
  const shirin = await mkPassenger("Shirin", "shirin@test.bd");
  nusratId = nusrat.id;
  rafiqId = rafiq.id;
  shirinId = shirin.id;

  const areas = [
    { name: "Banani", lat: 23.7937, lng: 90.4066 },
    { name: "Mohakhali", lat: 23.7806, lng: 90.4074 },
    { name: "Gulshan 1", lat: 23.7925, lng: 90.4078 },
    { name: "Dhanmondi", lat: 23.7461, lng: 90.3742 },
    { name: "Mirpur", lat: 23.8069, lng: 90.3687 },
    { name: "Uttara", lat: 23.8759, lng: 90.3795 },
  ];
  const created: Record<string, number> = {};
  for (const a of areas) {
    const row = await prisma.area.create({ data: a });
    created[a.name] = row.id;
  }
  bananiId = created["Banani"];
  mohakhaliId = created["Mohakhali"];
  gulshan1Id = created["Gulshan 1"];
  dhanmondiId = created["Dhanmondi"];
  mirpurId = created["Mirpur"];
  uttaraId = created["Uttara"];

  jashimToken = await login("jashim@test.bd");
  nusratToken = await login("nusrat@test.bd");
  rafiqToken = await login("rafiq@test.bd");
  shirinToken = await login("shirin@test.bd");
});

afterAll(async () => {
  await closeDb();
});

// ---------------------------------------------------------------------------
describe("1. Bullet's capacity can never be exceeded", () => {
  it("rejects opening a pool that needs more seats than Bullet has", async () => {
    // 4 requests x 1 seat > 3 seats
    const ids = [];
    for (let i = 0; i < 4; i++) {
      const r = await makeRide(nusratToken, bananiId, mohakhaliId, 1);
      ids.push(r.id);
    }
    const res = await request(app)
      .post("/driver/pools")
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: ids });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("NO_SEATS");
    await prisma.rideRequest.deleteMany({});
    await prisma.pool.deleteMany({});
  });

  it("rejects a join that would push seatsTaken past capacity", async () => {
    const a = await makeRide(nusratToken, bananiId, mohakhaliId, 1);
    const b = await makeRide(rafiqToken, bananiId, gulshan1Id, 1);
    const c = await makeRide(shirinToken, bananiId, mohakhaliId, 2); // wants 2

    const poolRes = await request(app)
      .post("/driver/pools")
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: [a.id, b.id] });
    expect(poolRes.status).toBe(201);
    const poolId = poolRes.body.pool.id;

    // 2 taken + 2 wanted = 4 > 3
    const join = await request(app)
      .post(`/pools/${poolId}/join`)
      .set("Authorization", `Bearer ${shirinToken}`)
      .send({ requestId: c.id });
    expect(join.status).toBe(409);
    expect(join.body.error.code).toBe("NO_SEATS");

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool!.seatsTaken).toBeLessThanOrEqual(pool!.capacity);
  });

  it("DB CHECK constraint is the second net", async () => {
    // Even raw SQL cannot write seats_taken > capacity
    const p = await prisma.pool.create({
      data: { vehicleId: (await prisma.vehicle.findFirst())!.id, capacity: 3, seatsTaken: 0 },
    });
    await expect(
      prisma.$executeRaw`UPDATE pools SET seats_taken = 99 WHERE id = ${p.id}`
    ).rejects.toThrow(); // CHECK violation
    await prisma.$executeRaw`DELETE FROM pools WHERE id = ${p.id}`;
  });
});

// ---------------------------------------------------------------------------
describe("2. Invalid state transitions are rejected", () => {
  it("REQUESTED -> STARTED is rejected (409 INVALID_TRANSITION)", async () => {
    const r = await makeRide(nusratToken, bananiId, mohakhaliId);
    const poolRes = await request(app)
      .post("/driver/pools")
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: [r.id] });
    const poolId = poolRes.body.pool.id;

    // skip DRIVER_ARRIVED, jump straight to STARTED
    const res = await request(app)
      .post(`/driver/pools/${poolId}/start`)
      .set("Authorization", `Bearer ${jashimToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("COMPLETED is terminal - no further transitions", async () => {
    const r = await makeRide(nusratToken, bananiId, mohakhaliId);
    const poolRes = await request(app)
      .post("/driver/pools")
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: [r.id] });
    const poolId = poolRes.body.pool.id;

    const steps = ["arrived", "start", "complete"] as const;
    for (const step of steps) {
      const res = await request(app)
        .post(`/driver/pools/${poolId}/${step}`)
        .set("Authorization", `Bearer ${jashimToken}`);
      expect(res.status).toBe(200);
    }

    const again = await request(app)
      .post(`/driver/pools/${poolId}/start`)
      .set("Authorization", `Bearer ${jashimToken}`);
    expect(again.status).toBe(409);
  });

  it("only the pool's driver can drive its lifecycle", async () => {
    const r = await makeRide(nusratToken, bananiId, mohakhaliId);
    const poolRes = await request(app)
      .post("/driver/pools")
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: [r.id] });
    const poolId = poolRes.body.pool.id;

    const res = await request(app)
      .post(`/driver/pools/${poolId}/arrived`)
      .set("Authorization", `Bearer ${nusratToken}`); // passenger, wrong role
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
describe("3. Nusrat's and Rafiq's pooled fares calculate correctly", () => {
  it("hand-calculated pooled fare matches the API", async () => {
    // fares for a solo trip first
    const est1 = await request(app)
      .get("/rides/estimate")
      .query({ pickup: bananiId, dest: mohakhaliId, poolSize: 1 });
    const est2 = await request(app)
      .get("/rides/estimate")
      .query({ pickup: bananiId, dest: gulshan1Id, poolSize: 2 });

    expect(est1.status).toBe(200);
    expect(est2.status).toBe(200);

    // manual check: total = base + distance - discount
    for (const est of [est1.body, est2.body]) {
      expect(est.basePaisa + est.distancePaisa - est.discountPaisa).toBe(
        est.totalPaisa
      );
      // no floats in money
      expect(Number.isInteger(est.totalPaisa)).toBe(true);
    }

    // pooled (poolSize=2) must be cheaper than solo for the same trip
    const solo = await request(app)
      .get("/rides/estimate")
      .query({ pickup: bananiId, dest: mohakhaliId, poolSize: 1 });
    const pooled = await request(app)
      .get("/rides/estimate")
      .query({ pickup: bananiId, dest: mohakhaliId, poolSize: 2 });
    expect(pooled.body.totalPaisa).toBeLessThan(solo.body.totalPaisa);
    expect(pooled.body.discountPaisa).toBeGreaterThan(0);
  });

  it("stored fares after pooling match computeFare exactly", async () => {
    await prisma.rideRequest.deleteMany({});
    await prisma.pool.deleteMany({});

    const n = await makeRide(nusratToken, bananiId, mohakhaliId);
    const r = await makeRide(rafiqToken, bananiId, gulshan1Id);

    const poolRes = await request(app)
      .post("/driver/pools")
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: [n.id, r.id] });
    expect(poolRes.status).toBe(201);

    const rows = await prisma.rideRequest.findMany({
      where: { id: { in: [n.id, r.id] } },
      include: { fare: true, pickupArea: true, destArea: true, poolMembers: true },
    });
    expect(rows).toHaveLength(2);

    for (const row of rows) {
      const expected = computeFare({
        pickup: { lat: row.pickupArea.lat, lng: row.pickupArea.lng },
        dest: { lat: row.destArea.lat, lng: row.destArea.lng },
        poolSize: 2, // pool of 2
      });
      expect(row.fare!.totalPaisa).toBe(expected.totalPaisa);
      expect(row.fare!.discountPaisa).toBe(expected.discountPaisa);
      expect(row.poolMembers[0].farePaisa).toBe(expected.totalPaisa);
    }
  });
});

// ---------------------------------------------------------------------------
describe("4. Users can't modify another user's ride", () => {
  it("Rafiq cannot view or cancel Nusrat's ride", async () => {
    const n = await makeRide(nusratToken, bananiId, mohakhaliId);

    const view = await request(app)
      .get(`/rides/${n.id}`)
      .set("Authorization", `Bearer ${rafiqToken}`);
    expect(view.status).toBe(403);

    const cancel = await request(app)
      .delete(`/rides/${n.id}`)
      .set("Authorization", `Bearer ${rafiqToken}`);
    expect(cancel.status).toBe(403);

    // still alive
    const still = await prisma.rideRequest.findUnique({ where: { id: n.id } });
    expect(still!.status).toBe("REQUESTED");
  });

  it("history only ever returns your own rides", async () => {
    const res = await request(app)
      .get("/rides")
      .set("Authorization", `Bearer ${rafiqToken}`);
    expect(res.status).toBe(200);
    for (const ride of res.body.rides) {
      expect(ride.passengerId).toBe(rafiqId);
    }
    expect(res.body.rides.some((r: any) => r.passengerId === nusratId)).toBe(false);
  });

  it("unauthenticated requests are rejected", async () => {
    const res = await request(app).get("/rides");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe("5. Cancellation rules hold", () => {
  it("can cancel while REQUESTED", async () => {
    const r = await makeRide(nusratToken, bananiId, mohakhaliId);
    const res = await request(app)
      .delete(`/rides/${r.id}`)
      .set("Authorization", `Bearer ${nusratToken}`);
    expect(res.status).toBe(200);

    const row = await prisma.rideRequest.findUnique({ where: { id: r.id } });
    expect(row!.status).toBe("CANCELLED");
  });

  it("cancel while MATCHED releases the seats", async () => {
    await prisma.rideRequest.deleteMany({});
    await prisma.pool.deleteMany({});

    const n = await makeRide(nusratToken, bananiId, mohakhaliId);
    const r = await makeRide(rafiqToken, bananiId, gulshan1Id);
    const poolRes = await request(app)
      .post("/driver/pools")
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: [n.id, r.id] });
    const poolId = poolRes.body.pool.id;
    expect(poolRes.body.pool.seatsTaken).toBe(2);

    const res = await request(app)
      .delete(`/rides/${n.id}`)
      .set("Authorization", `Bearer ${nusratToken}`);
    expect(res.status).toBe(200);

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool!.seatsTaken).toBe(1); // Nusrat's seat freed
  });

  it("cannot cancel once the trip is STARTED", async () => {
    const n = await makeRide(nusratToken, bananiId, mohakhaliId);
    const poolRes = await request(app)
      .post("/driver/pools")
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: [n.id] });
    const poolId = poolRes.body.pool.id;

    for (const step of ["arrived", "start"] as const) {
      await request(app)
        .post(`/driver/pools/${poolId}/${step}`)
        .set("Authorization", `Bearer ${jashimToken}`);
    }

    const res = await request(app)
      .delete(`/rides/${n.id}`)
      .set("Authorization", `Bearer ${nusratToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CANCEL_NOT_ALLOWED");
  });
});

// ---------------------------------------------------------------------------
describe("6. Two concurrent requests can't corrupt pool capacity", () => {
  it("exactly one of Nusrat/Shirin wins the last seat (race)", async () => {
    await prisma.rideRequest.deleteMany({});
    await prisma.pool.deleteMany({});

    // Fill 2 of 3 seats
    const n = await makeRide(nusratToken, bananiId, mohakhaliId, 1);
    const r = await makeRide(rafiqToken, bananiId, gulshan1Id, 1);
    const poolRes = await request(app)
      .post("/driver/pools")
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: [n.id, r.id] });
    const poolId = poolRes.body.pool.id;

    // LAST seat - two passengers race for it at the same instant
    const s1 = await makeRide(shirinToken, bananiId, mohakhaliId, 1);
    const s2 = await makeRide(shirinToken, bananiId, dhanmondiId, 1);

    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/pools/${poolId}/join`)
        .set("Authorization", `Bearer ${shirinToken}`)
        .send({ requestId: s1.id }),
      request(app)
        .post(`/pools/${poolId}/join`)
        .set("Authorization", `Bearer ${shirinToken}`)
        .send({ requestId: s2.id }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]); // exactly one wins

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool!.seatsTaken).toBe(3); // never 4
    expect(pool!.seatsTaken).toBeLessThanOrEqual(pool!.capacity);

    // exactly one of the two racing requests became MATCHED
    const matched = await prisma.rideRequest.count({
      where: { id: { in: [s1.id, s2.id] }, status: "MATCHED" },
    });
    expect(matched).toBe(1);
  });

  it("faraway trips are rejected by the matching rule", async () => {
    await prisma.rideRequest.deleteMany({});
    await prisma.pool.deleteMany({});

    const n = await makeRide(nusratToken, bananiId, mohakhaliId, 1);
    const far = await makeRide(rafiqToken, uttaraId, mirpurId, 1); // Uttara->Mirpur

    const open = await request(app)
      .post("/driver/pools")
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: [n.id, far.id] });

    expect(open.status).toBe(409);
    expect(open.body.error.code).toBe("INCOMPATIBLE");
  });
});
