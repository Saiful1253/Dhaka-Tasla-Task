#!/usr/bin/env node
/**
 * Repeatable local smoke check for the production-shaped frontend service.
 * Run after `docker compose up --build` (or alongside `npm run dev`).
 * It intentionally uses only Node's built-in fetch and demo credentials.
 */
const baseUrl = (process.env.FRONTEND_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} → ${response.status}: ${text}`);
  }
  return body;
}

const page = await fetch(`${baseUrl}/`);
const html = await page.text();
assert(page.ok, `frontend page returned ${page.status}`);
assert(html.includes("Dhaka Tesla Pool"), "frontend document did not render the product shell");

const health = await json("/api/backend/health");
assert(health?.status === "ok", "frontend rewrite did not reach the API health endpoint");

const driverLogin = await json("/api/backend/auth/login", {
  method: "POST",
  body: JSON.stringify({
    email: "jashim@dhakatesla.bd",
    password: "tesla123",
  }),
});
assert(driverLogin?.user?.role === "driver", "demo driver login returned the wrong role");
const driverBoard = await json("/api/backend/driver/requests", {
  headers: { Authorization: `Bearer ${driverLogin.token}` },
});
assert(driverBoard?.vehicle?.capacity === 3, "demo driver vehicle is not capacity 3");

const passengerLogin = await json("/api/backend/auth/login", {
  method: "POST",
  body: JSON.stringify({
    email: "nusrat@dhakatesla.bd",
    password: "tesla123",
  }),
});
assert(passengerLogin?.user?.role === "passenger", "demo passenger login returned the wrong role");
const rides = await json("/api/backend/rides", {
  headers: { Authorization: `Bearer ${passengerLogin.token}` },
});
assert(Array.isArray(rides?.rides), "passenger history contract is missing rides[]");
assert(
  rides.rides.every(
    (ride) =>
      ride.passengerId === passengerLogin.user.id &&
      Object.prototype.hasOwnProperty.call(ride, "pool"),
  ),
  "passenger history leaked another owner or omitted pool membership",
);

const liveActivity = await json("/api/backend/rides/activity", {
  headers: { Authorization: `Bearer ${passengerLogin.token}` },
});
assert(
  Number.isInteger(liveActivity?.activeCount) && Array.isArray(liveActivity?.requests),
  "live booking activity contract is missing activeCount or requests[]",
);
assert(
  Object.keys(liveActivity).sort().join(",") === "activeCount,refreshedAt,requests" &&
    typeof liveActivity.refreshedAt === "string" &&
    !Number.isNaN(Date.parse(liveActivity.refreshedAt)),
  "live booking activity contract is missing a valid refreshedAt or has unexpected top-level fields",
);
const activityKeys = ["createdAt", "destination", "pickup", "seats", "activityId"].sort();
assert(
  liveActivity.requests.length <= 20 &&
    liveActivity.requests.every(
      (request) =>
        Object.keys(request).sort().join(",") === activityKeys.join(",") &&
        typeof request.activityId === "string" &&
        typeof request.pickup === "string" &&
        typeof request.destination === "string" &&
        Number.isInteger(request.seats) &&
        typeof request.createdAt === "string" &&
        !Number.isNaN(Date.parse(request.createdAt)),
    ),
  "live booking activity returned an unsafe or oversized response",
);
assert(
  !JSON.stringify(liveActivity.requests).match(
    /passenger|email|fare|totalTaka|baseTaka|distanceTaka|userId|requestId/i,
  ),
  "live booking activity leaked a private field",
);

const retiredOpenPool = await fetch(`${baseUrl}/api/backend/pools/open`, {
  headers: { Authorization: `Bearer ${passengerLogin.token}` },
});
assert(
  retiredOpenPool.status === 404,
  `passenger open-pool route should be disabled, received ${retiredOpenPool.status}`,
);

const passengerJoin = await fetch(`${baseUrl}/api/backend/pools/1/join`, {
  method: "POST",
  headers: {
    Accept: "application/json",
    Authorization: `Bearer ${passengerLogin.token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ requestId: 1 }),
});
assert(
  passengerJoin.status === 404,
  `passenger self-join route should be disabled, received ${passengerJoin.status}`,
);

assert(
  Array.isArray(driverBoard?.requests) &&
    driverBoard.requests.every(
      (request) =>
        request.status === "REQUESTED" &&
        request.passenger &&
        Array.isArray(request.compatibility?.compatibleRequestIds),
    ),
  "driver request board contract is invalid",
);

console.log(
  "Frontend smoke passed: page, rewrite, driver manual board, scoped history, private activity, and no passenger self-join.",
);
