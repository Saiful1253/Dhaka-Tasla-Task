import request from "supertest";
import bcrypt from "bcryptjs";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
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

beforeEach(async () => {
  // Every integration example starts from an empty ride/pool ledger while the
  // disposable database and story accounts remain stable for the whole file.
  await prisma.pool.deleteMany({});
  await prisma.rideRequest.deleteMany({});
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

  it("rejects a driver's manual assignment that would push seatsTaken past capacity", async () => {
    const a = await makeRide(nusratToken, bananiId, mohakhaliId, 1);
    const b = await makeRide(rafiqToken, bananiId, gulshan1Id, 1);
    const c = await makeRide(shirinToken, bananiId, mohakhaliId, 2); // wants 2

    const poolRes = await request(app)
      .post("/driver/pools")
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: [a.id, b.id] });
    expect(poolRes.status).toBe(201);
    const poolId = poolRes.body.pool.id;

    // 2 taken + 2 manually selected = 4 > 3
    const assignment = await request(app)
      .post(`/driver/pools/${poolId}/requests`)
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: [c.id] });
    expect(assignment.status).toBe(409);
    expect(assignment.body.error.code).toBe("NO_SEATS");

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool!.seatsTaken).toBeLessThanOrEqual(pool!.capacity);
    const waiting = await prisma.rideRequest.findUnique({
      where: { id: c.id },
      include: { poolMembers: true },
    });
    expect(waiting!.status).toBe("REQUESTED");
    expect(waiting!.poolMembers).toHaveLength(0);
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
      expect(est.baseTaka + est.distanceTaka - est.discountTaka).toBe(
        est.totalTaka
      );
      // no floats in money
      expect(Number.isInteger(est.totalTaka)).toBe(true);
    }

    // pooled (poolSize=2) must be cheaper than solo for the same trip
    const solo = await request(app)
      .get("/rides/estimate")
      .query({ pickup: bananiId, dest: mohakhaliId, poolSize: 1 });
    const pooled = await request(app)
      .get("/rides/estimate")
      .query({ pickup: bananiId, dest: mohakhaliId, poolSize: 2 });
    expect(pooled.body.totalTaka).toBeLessThan(solo.body.totalTaka);
    expect(pooled.body.discountTaka).toBeGreaterThan(0);
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
      expect(row.fare!.totalTaka).toBe(expected.totalTaka);
      expect(row.fare!.discountTaka).toBe(expected.discountTaka);
      expect(row.poolMembers[0].fareTaka).toBe(expected.totalTaka);
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

  it("cancel while MATCHED releases seats and recalculates the remaining solo fare", async () => {
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

    const pooled = await prisma.rideRequest.findUnique({
      where: { id: r.id },
      include: { fare: true, pickupArea: true, destArea: true, poolMembers: true },
    });
    const pooledExpected = computeFare({
      pickup: { lat: pooled!.pickupArea.lat, lng: pooled!.pickupArea.lng },
      dest: { lat: pooled!.destArea.lat, lng: pooled!.destArea.lng },
      poolSize: 2,
    });
    expect(pooled!.fare!.discountTaka).toBeGreaterThan(0);
    expect(pooled!.fare!.totalTaka).toBe(pooledExpected.totalTaka);
    expect(pooled!.poolMembers[0].fareTaka).toBe(pooledExpected.totalTaka);

    const res = await request(app)
      .delete(`/rides/${n.id}`)
      .set("Authorization", `Bearer ${nusratToken}`);
    expect(res.status).toBe(200);

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool!.seatsTaken).toBe(1); // Nusrat's seat freed

    const remaining = await prisma.rideRequest.findUnique({
      where: { id: r.id },
      include: { fare: true, pickupArea: true, destArea: true, poolMembers: true },
    });
    const soloExpected = computeFare({
      pickup: { lat: remaining!.pickupArea.lat, lng: remaining!.pickupArea.lng },
      dest: { lat: remaining!.destArea.lat, lng: remaining!.destArea.lng },
      poolSize: 1,
    });
    expect(remaining!.fare!.discountTaka).toBe(0);
    expect(remaining!.fare!.totalTaka).toBe(soloExpected.totalTaka);
    expect(remaining!.poolMembers[0].fareTaka).toBe(soloExpected.totalTaka);

    const details = await request(app)
      .get(`/pools/${poolId}`)
      .set("Authorization", `Bearer ${rafiqToken}`);
    expect(details.status).toBe(200);
    const own = details.body.pool.members.find(
      (member: { isMe: boolean }) => member.isMe,
    );
    expect(own.myFareTaka).toBe(soloExpected.totalTaka);
    expect(own.myFare.discountTaka).toBe(0);
    expect(own.myFare.totalTaka).toBe(soloExpected.totalTaka);
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
describe("6. Two concurrent manual assignments can't corrupt pool capacity", () => {
  it("exactly one driver assignment wins the last seat (race)", async () => {
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

    // LAST seat - two passenger requests are selected at the same instant
    const s1 = await makeRide(shirinToken, bananiId, mohakhaliId, 1);
    const s2 = await makeRide(shirinToken, bananiId, dhanmondiId, 1);

    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/driver/pools/${poolId}/requests`)
        .set("Authorization", `Bearer ${jashimToken}`)
        .send({ requestIds: [s1.id] }),
      request(app)
        .post(`/driver/pools/${poolId}/requests`)
        .set("Authorization", `Bearer ${jashimToken}`)
        .send({ requestIds: [s2.id] }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]); // exactly one wins
    const rejected = [res1, res2].find((response) => response.status === 409);
    expect(rejected?.body.error.code).toBe("NO_SEATS");

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool!.seatsTaken).toBe(3); // never 4
    expect(pool!.seatsTaken).toBeLessThanOrEqual(pool!.capacity);

    // exactly one of the two racing requests became MATCHED
    const matched = await prisma.rideRequest.count({
      where: { id: { in: [s1.id, s2.id] }, status: "MATCHED" },
    });
    const stillWaiting = await prisma.rideRequest.count({
      where: { id: { in: [s1.id, s2.id] }, status: "REQUESTED" },
    });
    expect(matched).toBe(1);
    expect(stillWaiting).toBe(1);
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

describe("7. Day-2 signup, manual assignment, and last-seat contracts", () => {
  it("provisions a usable capacity-3 vehicle for a newly registered driver", async () => {
    const email = `new-driver-${Date.now()}@test.bd`;
    const signup = await request(app)
      .post("/auth/signup")
      .send({
        name: "New Driver",
        email,
        password: "tesla123",
        role: "driver",
      });
    expect(signup.status).toBe(201);
    expect(signup.body.user.role).toBe("driver");

    const board = await request(app)
      .get("/driver/requests")
      .set("Authorization", `Bearer ${signup.body.token}`);
    expect(board.status).toBe(200);
    expect(board.body.vehicle.capacity).toBe(3);
    expect(board.body.vehicle.isOnline).toBe(false);

    const vehicle = await prisma.vehicle.findFirst({
      where: { driver: { email } },
    });
    expect(vehicle).not.toBeNull();
    expect(vehicle!.capacity).toBe(3);
  });

  it("registers and signs in a passenger without provisioning a vehicle", async () => {
    const email = `new-passenger-${Date.now()}@test.bd`;
    const signup = await request(app)
      .post("/auth/signup")
      .send({
        name: "New Passenger",
        email: `  ${email.toUpperCase()}  `,
        password: "tesla123",
        role: "passenger",
      });
    expect(signup.status).toBe(201);
    expect(signup.body.user.role).toBe("passenger");
    expect(signup.body.user.email).toBe(email);

    const login = await request(app)
      .post("/auth/login")
      .send({ email: email.toUpperCase(), password: "tesla123" });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(signup.body.user.id);

    const rides = await request(app)
      .get("/rides")
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(rides.status).toBe(200);
    expect(rides.body.rides).toEqual([]);
    const vehicles = await prisma.vehicle.count({
      where: { driver: { email } },
    });
    expect(vehicles).toBe(0);
  });

  it("returns a structurally complete unpooled ride after creation", async () => {
    const created = await request(app)
      .post("/rides")
      .set("Authorization", `Bearer ${nusratToken}`)
      .send({ pickupAreaId: bananiId, destAreaId: mohakhaliId, seats: 1 });
    expect(created.status).toBe(201);
    expect(created.body.ride).toHaveProperty("pool", null);
    expect(created.body.ride).toHaveProperty("fare");
  });

  it("rejects invalid estimate ranges instead of returning misleading fares", async () => {
    const invalidSeats = await request(app)
      .get("/rides/estimate")
      .query({ pickup: bananiId, dest: mohakhaliId, seats: 4 });
    expect(invalidSeats.status).toBe(400);
    expect(invalidSeats.body.error.code).toBe("BAD_REQUEST");

    const invalidPool = await request(app)
      .get("/rides/estimate")
      .query({ pickup: bananiId, dest: mohakhaliId, poolSize: 0 });
    expect(invalidPool.status).toBe(400);
    expect(invalidPool.body.error.code).toBe("BAD_REQUEST");
  });

  it("keeps passenger ride resources passenger-only", async () => {
    const signup = await request(app)
      .post("/auth/signup")
      .send({
        name: "Route Guard",
        email: `route-guard-${Date.now()}@test.bd`,
        password: "tesla123",
        role: "driver",
      });
    const rides = await request(app)
      .get("/rides")
      .set("Authorization", `Bearer ${signup.body.token}`);
    expect(rides.status).toBe(403);
  });

  it("uses driver-only manual assignment, protects the last seat, and exposes no passenger pool routes", async () => {
    const n = await makeRide(nusratToken, bananiId, mohakhaliId, 1);
    const r = await makeRide(rafiqToken, bananiId, gulshan1Id, 1);
    const opened = await request(app)
      .post("/driver/pools")
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: [n.id, r.id] });
    expect(opened.status).toBe(201);
    const poolId = opened.body.pool.id;

    // Same pickup keeps this divergent destination compatible while Bullet's
    // final seat enforces the cap through the driver assignment endpoint.
    const finalSeat = await makeRide(shirinToken, bananiId, dhanmondiId, 1);
    const accepted = await request(app)
      .post(`/driver/pools/${poolId}/requests`)
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: [finalSeat.id] });
    expect(accepted.status).toBe(201);
    expect(accepted.body.pool.seatsTaken).toBe(3);

    const rejectedRequest = await makeRide(nusratToken, bananiId, gulshan1Id, 1);
    const rejected = await request(app)
      .post(`/driver/pools/${poolId}/requests`)
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: [rejectedRequest.id] });
    expect(rejected.status).toBe(409);
    expect(rejected.body.error.code).toBe("NO_SEATS");

    const unchanged = await prisma.rideRequest.findUnique({
      where: { id: rejectedRequest.id },
    });
    expect(unchanged!.status).toBe("REQUESTED");
    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    expect(pool!.seatsTaken).toBe(3);

    const openPools = await request(app)
      .get("/pools/open")
      .set("Authorization", `Bearer ${nusratToken}`);
    expect(openPools.status).toBe(404);
    expect(openPools.body.error.code).toBe("NOT_FOUND");

    const passengerJoin = await request(app)
      .post(`/pools/${poolId}/join`)
      .set("Authorization", `Bearer ${nusratToken}`)
      .send({ requestId: rejectedRequest.id });
    expect(passengerJoin.status).toBe(404);
    expect(passengerJoin.body.error.code).toBe("NOT_FOUND");

    const details = await request(app)
      .get(`/pools/${poolId}`)
      .set("Authorization", `Bearer ${shirinToken}`);
    expect(details.status).toBe(200);
    const own = details.body.pool.members.find(
      (member: { isMe: boolean }) => member.isMe,
    );
    const others = details.body.pool.members.filter(
      (member: { isMe: boolean }) => !member.isMe,
    );
    expect(own.myFareTaka).not.toBeNull();
    expect(
      others.every(
        (member: { myFareTaka: null }) => member.myFareTaka === null,
      ),
    ).toBe(true);
  });

  it("adds compatible requests to the active pool and exposes pool membership in history", async () => {
    const n = await makeRide(nusratToken, bananiId, mohakhaliId, 1);
    const opened = await request(app)
      .post("/driver/pools")
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: [n.id] });
    expect(opened.status).toBe(201);
    const poolId = opened.body.pool.id;

    const r = await makeRide(rafiqToken, bananiId, gulshan1Id, 1);
    const feed = await request(app)
      .get("/driver/requests")
      .set("Authorization", `Bearer ${jashimToken}`);
    const feedRequest = feed.body.requests.find(
      (item: { id: number }) => item.id === r.id,
    );
    expect(feedRequest.compatibility.fitsActivePool).toBe(true);
    expect(feedRequest.compatibility.addableToActivePool).toBe(true);

    const added = await request(app)
      .post(`/driver/pools/${poolId}/requests`)
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: [r.id] });
    expect(added.status).toBe(201);
    expect(added.body.pool.seatsTaken).toBe(2);

    const history = await request(app)
      .get("/rides")
      .set("Authorization", `Bearer ${rafiqToken}`);
    const ownRide = history.body.rides.find(
      (ride: { id: number }) => ride.id === r.id,
    );
    expect(ownRide.pool.id).toBe(poolId);
    expect(ownRide.poolMembers).toBeUndefined();

    const secondPool = await request(app)
      .post("/driver/pools")
      .set("Authorization", `Bearer ${jashimToken}`)
      .send({ requestIds: [(await makeRide(shirinToken, bananiId, mohakhaliId, 1)).id] });
    expect(secondPool.status).toBe(409);
    expect(secondPool.body.error.code).toBe("ACTIVE_POOL_EXISTS");
  });

  it("keeps one active pool per vehicle under concurrent opens", async () => {
    const first = await makeRide(nusratToken, bananiId, mohakhaliId, 1);
    const second = await makeRide(rafiqToken, bananiId, gulshan1Id, 1);

    const [firstResult, secondResult] = await Promise.all([
      request(app)
        .post("/driver/pools")
        .set("Authorization", `Bearer ${jashimToken}`)
        .send({ requestIds: [first.id] }),
      request(app)
        .post("/driver/pools")
        .set("Authorization", `Bearer ${jashimToken}`)
        .send({ requestIds: [second.id] }),
    ]);

    expect([firstResult.status, secondResult.status].sort()).toEqual([201, 409]);
    const activePools = await prisma.pool.count({
      where: { status: { in: ["REQUESTED", "MATCHED", "DRIVER_ARRIVED", "STARTED"] } },
    });
    expect(activePools).toBe(1);
  });
});

describe("8. Privacy-safe passenger live booking activity", () => {
  it("requires an authenticated passenger", async () => {
    const anonymous = await request(app).get("/rides/activity");
    expect(anonymous.status).toBe(401);

    const driver = await request(app)
      .get("/rides/activity")
      .set("Authorization", `Bearer ${jashimToken}`);
    expect(driver.status).toBe(403);
  });

  it("returns only other REQUESTED rides in newest-first, privacy-safe form", async () => {
    const own = await makeRide(nusratToken, bananiId, mohakhaliId, 1);
    const older = await makeRide(rafiqToken, bananiId, gulshan1Id, 2);
    const newer = await makeRide(shirinToken, bananiId, dhanmondiId, 1);
    const notWaiting = await makeRide(rafiqToken, bananiId, uttaraId, 1);

    await prisma.rideRequest.update({
      where: { id: notWaiting.id },
      data: {
        status: "MATCHED",
        createdAt: new Date("2026-01-01T12:00:00.000Z"),
      },
    });
    await prisma.rideRequest.update({
      where: { id: older.id },
      data: { createdAt: new Date("2026-01-01T10:00:00.000Z") },
    });
    await prisma.rideRequest.update({
      where: { id: newer.id },
      data: { createdAt: new Date("2026-01-01T11:00:00.000Z") },
    });

    const response = await request(app)
      .get("/rides/activity")
      .set("Authorization", `Bearer ${nusratToken}`);

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body.activeCount).toBe(2);
    expect(response.body.requests).toHaveLength(2);
    expect(response.body.requests[0].destination).toBe("Dhanmondi");
    expect(response.body.requests[1].destination).toBe("Gulshan 1");
    expect(new Date(response.body.requests[0].createdAt).getTime()).toBeGreaterThan(
      new Date(response.body.requests[1].createdAt).getTime(),
    );

    const allowedKeys = [
      "activityId",
      "createdAt",
      "destination",
      "pickup",
      "seats",
    ];
    for (const row of response.body.requests) {
      expect(Object.keys(row).sort()).toEqual(allowedKeys);
      expect(row.activityId).toMatch(/^act_[a-f0-9]{16}$/);
      expect(row.activityId).not.toBe(String(own.id));
      expect(row.pickup).toBe("Banani");
      expect(row.seats).toBeGreaterThanOrEqual(1);
    }

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toMatch(/Nusrat|Rafiq|Shirin|passengerId|passenger|email|fare|status|requestId|pool/i);
    expect(response.body.refreshedAt).toEqual(expect.any(String));
    expect(Number.isNaN(new Date(response.body.refreshedAt).getTime())).toBe(false);
  });

  it("caps displayed rows while keeping the live total", async () => {
    for (let index = 0; index < 21; index += 1) {
      const token = index % 2 === 0 ? rafiqToken : shirinToken;
      await makeRide(token, bananiId, index % 2 === 0 ? mohakhaliId : gulshan1Id, 1);
    }

    const response = await request(app)
      .get("/rides/activity")
      .set("Authorization", `Bearer ${nusratToken}`);

    expect(response.status).toBe(200);
    expect(response.body.activeCount).toBe(21);
    expect(response.body.requests).toHaveLength(20);
  });
});
