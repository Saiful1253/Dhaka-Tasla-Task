# Dhaka Tesla Pool 🚗⚡

> Share a seat. Split the fare. Survive Dhaka traffic.

An MVP ride-pooling service for Dhaka where passengers can request a ride, share a 3-seat electric "Tesla" with compatible strangers, split the fare fairly, and the driver always knows who's riding and at what stage.

Live Link: frontend-hazel-eta-btpcw9eq0e.vercel.app
---

## 📖 Table of Contents

- [Summary](#-summary)
- [Problem Statement](#-problem-statement)
- [Features Implemented](#-features-implemented)
- [Assumptions](#-assumptions)
- [Architecture](#-architecture)
- [Database / ERD](#-database--erd)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Environment Variables](#-environment-variables)
- [Local Setup](#-local-setup)
- [Optional Docker Instructions](#-optional-docker-instructions)
- [Running Tests](#-running-tests)
- [Demo Credentials](#-demo-credentials)
- [API Overview](#-api-overview)
- [Deployment on Vercel](#-deployment-on-vercel)
- [Key Decisions & Trade-offs](#-key-decisions--trade-offs)
- [Known Limitations](#-known-limitations)
- [Next Improvements](#-next-improvements)
- [AI Usage](#-ai-usage)
- [Demo Video](#-demo-video)

---

## 📝 Summary

**Dhaka Tesla Pool** is a full-stack ride-pooling MVP. One driver (Jashim) with one 3-seat vehicle (Bullet) can carry multiple passengers whose trips overlap. Each passenger sees only *their own* fare and request status; the shared roster exposes routes and the common pool lifecycle, but never another passenger's fare. Pool transitions and pooled cancellations are guarded server-side and recorded in an audit trail.

**Problem:** Nusrat wants Banani → Mohakhali, Rafiq wants Banani → Gulshan 1, and 30 seconds later Shirin wants the last seat. Jashim opens the initial pool, manually selects compatible passengers, and the server calculates each fare while preventing Bullet's 3 seats from being exceeded — even when two last-seat claims arrive at the exact same instant.

> 🚧 **Status:** Day 2 — passenger and driver consoles, driver-only manual assignment, signup provisioning, live manifests, Vercel-ready frontend/backend entry points, smoke coverage, and release documentation are implemented locally. No public deployment or release tag has been fabricated.

---

## 🧩 Features Implemented

- [x] Passenger sign-up / sign-in (JWT)
- [x] Driver sign-up / sign-in (JWT) + online/offline toggle
- [x] Ride request: pickup area, destination area, seats
- [x] Fare estimate (hand-testable breakdown)
- [x] Ride lifecycle with server-side state guard
- [x] Pool creation + **atomic seat-capacity enforcement**
- [x] Corridor/zone matching rule
- [x] Per-passenger fare isolation + scoped ride history
- [x] Pooled lifecycle/cancellation audit trail (`ride_events`)
- [x] Cancellation while in a valid state
- [x] Seed data with the story cast
- [x] Optional Docker Compose setup for PostgreSQL, API, and frontend
- [x] Tests (capacity, transitions, fare, authz, cancellation, concurrency, signup, and full-pool rejection)
- [x] Next.js passenger and driver consoles with responsive async states
- [x] Privacy-safe live booking activity + driver manual assignment
- [x] Driver-only manual assignment with atomic capacity enforcement; passenger requests remain unassigned until the driver selects them
- [x] Driver add-to-pool flow, seat meter, lifecycle actions, roster, and event trail
- [x] New driver signup provisions a default capacity-3 vehicle
- [x] Frontend production build and repeatable smoke check
- [x] Desktop/mobile screenshots and Vercel + managed-PostgreSQL deployment preparation

---

## 📌 Assumptions

Some requirements were intentionally left open. These are the assumptions made, documented, and applied consistently:

1. **Matching rule:** the driver may assign a waiting request to a matched pool when it has the **same pickup area** *OR* an overlapping pickup→destination corridor with every existing member. Nusrat (Banani→Mohakhali), Rafiq (Banani→Gulshan 1), and Shirin (Banani→Dhanmondi) share Banani; capacity still determines who receives the last seat.
2. **Money is stored as whole Taka (৳).** Values are integers — avoids floating-point drift and keeps fares exact and hand-verifiable.
3. **Cancellation is allowed only in `REQUESTED` or `MATCHED`** (i.e. before the driver arrives). Once `DRIVER_ARRIVED` the trip is considered committed; only the driver/admin could cancel.
4. **One active pool per vehicle at a time.** A vehicle's pool must reach `COMPLETED`/`CANCELLED` before a new one opens — keeps capacity accounting trivial and correct.
5. **No real payment gateway.** Payment is Cash or a simulated **TeslaPay** wallet.
6. **No map API.** Pickup/destination are a predefined list of Dhaka areas (`areas` table) with lat/lng centers; distance is computed with the Haversine formula between zone centers. This matches the brief's "keep geography simple" rule and keeps everything free and hand-testable.
7. **Driver-only manual dispatch:** passengers request rides first. A driver manually selects compatible waiting requests; passenger self-service joining is intentionally not exposed. The selected set uses the atomic capacity guard, and a rejected request stays `REQUESTED`.
8. **New driver provisioning:** driver signup creates a default offline capacity-3 vehicle in the same database transaction as the user. Jashim's seeded vehicle remains the primary demo vehicle.

---

## 🏗️ Architecture

> Required by the brief: Browser → Next.js/React → Node.js API → Database.

```mermaid
flowchart LR
    subgraph Client["🌐 Browser"]
        UI["Next.js (App Router)\nReact + Tailwind\nPassenger View | Driver View"]
    end

    subgraph Server["⚙️ Node.js API (Express + TypeScript)"]
        MW["Middleware\nJWT Auth · Zod Validation\nError Handler · Logger"]
        SVC["Business Logic\nAuth · Ride · Pool · Fare · Matching Rule"]
        GUARD["Invariants\nState-machine guard · Capacity guard\nAtomic seat claim · Per-user scoping"]
    end

    subgraph Data["🗄️ PostgreSQL"]
        T[("users · vehicles · areas\nride_requests · pools\npool_members · fares\nride_events · payments")]
    end

    subgraph Ops["☁️ Deployment options"]
        C0["Vercel frontend"] --> C1["Vercel Express API"] --> C2["Managed PostgreSQL"]
    end

    UI -- "HTTPS · JSON (REST)" --> MW
    MW --> SVC
    SVC --> GUARD
    GUARD -- "Prisma tx" --> T
    UI -.-> Ops
```

Deliberately **one API, one database**. No microservices, Kafka, Kubernetes, Redis, or queues — complexity is only added when there is a real reason.

---

## 🗄️ Database / ERD

```mermaid
erDiagram
    USERS ||--o{ VEHICLES        : "driver owns"
    USERS ||--o{ RIDE_REQUESTS   : "passenger books"
    USERS ||--o{ RIDE_EVENTS     : "acts on ride"
    AREAS ||--o{ RIDE_REQUESTS   : "pickup area"
    AREAS ||--o{ RIDE_REQUESTS   : "destination area"
    VEHICLES ||--o{ POOLS        : "carries pool"
    POOLS    ||--|{ POOL_MEMBERS : "contains"
    RIDE_REQUESTS ||--o{ POOL_MEMBERS : "joins"
    RIDE_REQUESTS ||--|| FARES    : "priced by"
    POOLS    ||--o{ RIDE_EVENTS   : "status history"
    FARES    ||--o{ PAYMENTS      : "settled by"

    USERS {
        int    id PK
        string name
        string email UK
        string password_hash
        enum   role "passenger | driver"
    }
    VEHICLES {
        int    id PK
        int    driver_id FK
        string name        "Bullet"
        int    capacity    "3 - never exceeded"
        bool   is_online
    }
    AREAS {
        int    id PK
        string name UK     "Banani | Gulshan | Mohakhali ..."
        float  lat
        float  lng
    }
    RIDE_REQUESTS {
        int    id PK
        int    passenger_id FK
        int    pickup_area_id FK
        int    dest_area_id FK
        int    seats_requested
        enum   status       "REQUESTED | MATCHED | ..."
    }
    POOLS {
        int    id PK
        int    vehicle_id FK
        enum   status
        int    capacity
        int    seats_taken  "guarded: seats_taken <= capacity"
    }
    POOL_MEMBERS {
        int    id PK
        int    pool_id FK
        int    request_id FK
        int    seats
        int    fare_taka   "individual fare"
    }
    FARES {
        int    id PK
        int    request_id FK
        int    base_taka
        int    distance_taka
        int    discount_taka
        int    total_taka  "whole Taka"
    }
    RIDE_EVENTS {
        int    id PK
        int    pool_id FK
        int    actor_id FK
        string from_status
        string to_status
        time   at
    }
    PAYMENTS {
        int    id PK
        int    fare_id FK
        enum   method  "cash | teslapay (simulated)"
        enum   status
    }
```

### Schema (source of truth)

```sql
users(id, name, email, password_hash, role[passenger|driver], created_at)
vehicles(id, driver_id->users, name, capacity, plate, is_online)
areas(id, name, lat, lng)                       -- Banani, Gulshan, Mohakhali, ...
ride_requests(id, passenger_id, pickup_area_id, dest_area_id, seats_requested,
              status[REQUESTED|MATCHED|DRIVER_ARRIVED|STARTED|COMPLETED|CANCELLED], created_at)
pools(id, vehicle_id->vehicles, status, capacity, seats_taken, created_at, started_at, completed_at)
-- partial unique index: one non-terminal pool per vehicle
pool_members(id, pool_id, request_id, seats, fare_taka)
fares(id, request_id, base_taka, distance_taka, discount_taka, total_taka)
ride_events(id, pool_id, actor_id, from_status, to_status, note, at)   -- audit/history
payments(id, fare_id, method[cash|teslapay], status)                    -- simulated
```

### Ride / Pool lifecycle (single source of truth for transitions)

```mermaid
stateDiagram-v2
    [*] --> REQUESTED : passenger requests ride
    REQUESTED --> MATCHED        : driver accepts / pool matched
    MATCHED   --> DRIVER_ARRIVED : Jashim marks arrival
    DRIVER_ARRIVED --> STARTED   : trip begins
    STARTED   --> COMPLETED      : trip ends → fare finalized

    REQUESTED  --> CANCELLED : passenger cancels (valid state)
    MATCHED    --> CANCELLED : cancel before arrival

    COMPLETED --> [*]
    CANCELLED  --> [*]
```

```ts
// Allowed transitions — validated SERVER-SIDE. Anything else => 409 CONFLICT.
const TRANSITIONS = {
  REQUESTED:      ['MATCHED', 'CANCELLED'],
  MATCHED:        ['DRIVER_ARRIVED', 'CANCELLED'],
  DRIVER_ARRIVED: ['STARTED'],
  STARTED:        ['COMPLETED'],
  COMPLETED:      [],
  CANCELLED:      [],
};
```

### Fare model (hand-testable)

```
distance_km     = haversine(pickup_area.lat/lng, dest_area.lat/lng)
subtotal_taka   = baseFare + round(distance_km * ratePerKm)
poolDiscount    = poolSize >= 2 ? round(subtotal_taka * DISCOUNT_PCT / 100) : 0
passengerFare   = subtotal_taka - poolDiscount        // stored in whole Taka
```

---

## 🛠️ Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + Tailwind CSS | Routing/SSR, fast clean UI |
| Backend | Node.js + Express + TypeScript | Simple, explicit, interview-friendly |
| Database | PostgreSQL 17 | ACID + row locking for capacity; FK/CHECK integrity |
| ORM | Prisma | Type-safe queries + migrations |
| Validation | Zod | Shared, typed request schemas |
| Auth | JWT + bcrypt | Stateless, explainable |
| Tests | Vitest + Supertest (against Dockerized Postgres) | Fast TS-native; real concurrency semantics |
| Deployment | Vercel (frontend + Express) + managed PostgreSQL | Small public surface; Docker is optional for local tests |

> Justification, alternatives, and "what would make me switch" for each: see [Key Decisions & Trade-offs](#-key-decisions--trade-offs).

---

## 📁 Project Structure

```
.
├── frontend/          # Next.js 14 App Router passenger/driver UI
│   ├── app/            # routes, layout, global visual system
│   ├── components/     # auth, passenger, driver, shared UI
│   ├── lib/            # typed API client/contracts, session, statuses
│   ├── scripts/        # production-shaped smoke check
│   └── Dockerfile
├── backend/           # Express API + Prisma
│   ├── prisma/        # schema, migrations, seed
│   ├── src/           # routes, guards, pooling/lifecycle logic
│   └── Dockerfile
├── docs/screenshots/  # local desktop/mobile product captures
├── docker-compose.yml
├── docker-compose.test.yml # disposable integration-test database
├── .env.example
├── read.md            # PRD deep analysis
└── plan.md            # 2-day build plan
```

---

## 📋 Prerequisites

- Node.js ≥ 20 (frontend and backend)
- A managed PostgreSQL database (Vercel Postgres, Neon, Supabase, or equivalent)
- Docker + Docker Compose only if using the optional local/test stack

---

## 🔐 Environment Variables

Copy `.env.example` → `.env`. **Never commit real secrets.**

```env
# API
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dhaka_tesla_pool
JWT_SECRET=change-me
PORT=4000

# Next.js (the browser uses the same-origin rewrite by default)
BACKEND_API_URL=http://localhost:4000
NEXT_PUBLIC_API_URL=/api/backend
```

---

## 🚀 Local Setup

### Optional one-command local stack

Docker is not required for the Vercel deployment. Use this section only when you want a local PostgreSQL/API/frontend stack or the integration-test environment.

```bash
cp .env.example .env                 # optional outside Docker; keep secrets local
 docker compose up --build
```

The API is seeded idempotently on startup. Open:

- Frontend: `http://localhost:3000`
- API health: `http://localhost:4000/health`
- PostgreSQL: `localhost:5432`

The frontend container receives `BACKEND_API_URL=http://api:4000` at build time and proxies `/api/backend/*` same-origin, so the browser does not need CORS configuration.

### Separate local processes

```bash
# terminal 1 — database
 docker compose up -d db
cd backend
 npm ci
 npx prisma migrate deploy
 npm run seed
 npm run dev                         # http://localhost:4000

# terminal 2 — frontend
cd frontend
npm ci
cp .env.example .env.local          # BACKEND_API_URL=http://localhost:4000
npm run dev                         # http://localhost:3000
```

Run `npm run typecheck` and `npm run build` in each app before sharing a build. The local API can be started without Docker only when PostgreSQL 17 is available and `DATABASE_URL` points at a disposable development database.

---

## 🐳 Optional Docker Instructions

```bash
docker compose up --build
```

Brings up:

- **db** — `postgres:17-alpine`, named volume `pgdata`, `pg_isready` healthcheck.
- **api** — builds `backend/`, waits for db, runs `prisma migrate deploy` + idempotent seed, then serves `/health`.
- **frontend** — builds `frontend/`, waits for API health, and serves the Next.js app on port 3000 with its own healthcheck.

`docker compose down` preserves the database volume; use `docker compose down -v` only when intentionally resetting local demo data. `.env` is never committed — copy `.env.example` and set `JWT_SECRET` for a deployed environment.

---

## 🧪 Running Tests

```bash
# pure logic, no database
cd backend
npm run test:unit

# full suite against a disposable PostgreSQL database
cd ..
docker compose -f docker-compose.test.yml up --build --exit-code-from api-test
docker compose -f docker-compose.test.yml down --remove-orphans
```

The integration setup uses a fresh `dhaka_tesla_pool_test` database in an internal-only Postgres container. `backend/tests/setup.ts` refuses to run destructive tests unless the database name contains `test` **and** `ALLOW_DESTRUCTIVE_DB_TESTS=true`; never point that suite at a shared database.

Frontend checks:

```bash
cd frontend
npm run typecheck
npm run build
npm run test:smoke             # expects the local stack on :3000
```

The smoke check verifies the rendered document, same-origin API rewrite, demo driver's manual-selection board, passenger history, and privacy-safe activity. Browser walkthrough screenshots are in [`docs/screenshots/`](./docs/screenshots/).

Backend coverage includes capacity, transition guards, fare math, authorization, cancellation, concurrent last-seat manual assignments, driver provisioning, active-pool additions, privacy-safe activity, and deterministic full-capacity rejection.

---

## 🔑 Demo Credentials

Seeded by `npm run seed` (password for all: `tesla123`):

| Role | Email | Notes |
|---|---|---|
| Driver | `jashim@dhakatesla.bd` | owns **Bullet**, capacity **3**, online after seed |
| Any new driver | signup | receives a default offline capacity-3 vehicle in the signup transaction |
| Passenger | `nusrat@dhakatesla.bd` | Banani → Mohakhali |
| Passenger | `rafiq@dhakatesla.bd` | Banani → Gulshan 1 |
| Passenger | `shirin@dhakatesla.bd` | arrives last, fights for the seat |

---

## 🔌 API Overview

Base URL: local `http://localhost:4000` or the deployed Vercel API origin · Auth: `Authorization: Bearer <token>` · Errors: `{ "error": { "code", "message" } }`

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/signup` | — | `{name,email,password,role}` → `{user,token}`; driver accounts atomically receive a default capacity-3 vehicle |
| POST | `/auth/login` | — | `{email,password}` → `{user,token}` |

### Areas & fare
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/areas` | any | predefined Dhaka zone list (id, name, lat, lng) |
| GET | `/rides/estimate?pickup=&dest=&seats=&poolSize=` | any | hand-testable fare breakdown (Taka) |

### Rides (passenger)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/rides` | passenger | create an unassigned request → `REQUESTED`; this does not book a pool |
| GET | `/rides` | passenger | my history only; each item includes `pool` membership (or `null`) and never another passenger's fare |
| GET | `/rides/activity` | passenger | privacy-safe anonymous view of other waiting routes; read-only |
| GET | `/rides/:id` | passenger (owner) | own ride + own fare (403 for others) |
| DELETE | `/rides/:id` | passenger (owner) | cancel while `REQUESTED`/`MATCHED`, releases seats atomically |
| DELETE | `/rides/history/:id` | passenger (owner) | remove one completed/cancelled ride from personal history |
| DELETE | `/rides/history` | passenger (owner) | remove all completed/cancelled rides from personal history |

### Driver & pool
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/driver/requests` | driver | vehicle + waiting requests + corridor/active-pool validation hints |
| POST | `/driver/online` | driver | toggle online/offline |
| POST | `/driver/pools` | driver | manually assign selected `{requestIds}` — atomic capacity check |
| POST | `/driver/pools/:id/requests` | driver (owner) | manually add selected compatible passengers before arrival |
| GET | `/driver/pools` | driver | my pools, passengers, seats, events |
| DELETE | `/driver/history/:id` | driver (owner) | remove one completed/cancelled pool from dispatch history |
| DELETE | `/driver/history` | driver (owner) | remove all completed/cancelled pools from dispatch history |
| POST | `/driver/pools/:id/arrived\|start\|complete\|cancel` | driver (owner) | guarded lifecycle → 409 on illegal move |
| GET | `/pools/:id` | driver or assigned member | roster + own fare only (`myFareTaka`) |
| GET | `/health` | — | liveness (local/Docker or Vercel API) |

---

## ⚖️ Key Decisions & Trade-offs

| Decision | Alternative | Why this | When I'd switch |
|---|---|---|---|
| PostgreSQL | MySQL / SQLite | Row locking + FK integrity for capacity; SQLite's locking differs and won't represent production concurrency | Team-standard MySQL, or a pure-embedded demo |
| Atomic conditional `UPDATE` for seat claim | Read-then-write check | Single statement, DB-guaranteed; can't overbook under race | Large scale → distributed lock / dedicated route-policy service |
| Zone list + Haversine | Google Maps / Leaflet | Brief says don't fight map APIs; free, hand-testable, no keys | Real routing/ETA becomes a requirement |
| JWT (stateless) | Sessions in Redis | No extra infra for an MVP | Need instant revocation → server-side sessions |
| Next.js App Router | Separate SPA + custom router | Typed routes, server-rendered shell, and a small deployable frontend | Need a non-React native client or heavy SSR personalization |
| Same-origin `/api/backend` rewrite | Direct browser CORS API | Keeps auth and API calls same-origin in local Docker/Vercel | Need independent API domains with a deliberate CORS/CSRF design |
| Vercel + managed PostgreSQL | Docker-only single-host deployment | Small deploy surface: two stateless app projects and an existing relational database; Docker stays available for local tests | The team needs a private network, custom runtime, or long-running workers |
| Whole-Taka integer | DECIMAL/float | Exact math, no drift, trivially hand-verifiable | The product needs fractional-Taka fares |

---

## ⚠️ Known Limitations

- Driver assignment uses the deterministic zone/corridor rule, not real routing, traffic prediction, or ETA.
- No real payment gateway (Cash / simulated TeslaPay); the UI does not collect payment details.
- Live status uses simple five-second polling rather than WebSockets/SSE.
- JWTs are stateless and last seven days; there is no refresh-token or server-side revocation flow.
- Passenger requests remain unassigned until a driver manually selects them; there is no passenger self-service pool-joining route.
- The smoke test uses seeded demo accounts and does not replace a full browser test suite.

---

## 🔭 Next Improvements

- PostGIS geospatial matching, route-aware ETA, and corridor versioning.
- Idempotency keys for driver assignment mutations, plus a short-lived availability snapshot.
- Refresh tokens, rate limiting, structured logs/tracing, and automated backups.
- SSE/WebSocket updates once the lifecycle event stream is separated from request/response polling.
- A larger browser test matrix and seeded, isolated end-to-end fixtures.

---

## 📸 Product Screenshots

The captures below are local, real product screenshots (no external image service or fabricated deployment UI):

| Passenger flow | Driver dispatch |
|---|---|
| ![Passenger request awaiting driver selection](./docs/screenshots/passenger-request-desktop.png) | ![Driver manifest and seat meter](./docs/screenshots/driver-active-desktop.png) |
| ![Passenger mobile assigned manifest](./docs/screenshots/passenger-pooled-mobile.png) | ![Driver mobile history](./docs/screenshots/driver-history-mobile.png) |

Also captured: [auth desktop](./docs/screenshots/auth-desktop.png), [auth mobile](./docs/screenshots/auth-mobile.png), and [driver empty board desktop](./docs/screenshots/driver-empty-desktop.png). The files are intentionally committed as documentation assets; generated browser reports and local secrets remain ignored.

---

## 🚀 Deployment on Vercel

Docker is **not required** for the public deployment. Use two Vercel projects backed by one managed PostgreSQL database:

```text
Browser → Next.js (frontend project) → /api/backend rewrite → Express (backend project) → PostgreSQL
```

1. Create a managed PostgreSQL database (Vercel Postgres, Neon, Supabase, or equivalent) and set `DATABASE_URL` in the backend project. Use the provider's direct URL for the one-time migration if it supplies separate pooled/direct URLs.
2. Create the backend Vercel project with **Root Directory** `backend`. The checked-in `backend/api/index.ts` exports the Express app and `backend/vercel.json` routes requests to that Node 20 function; set `JWT_SECRET`, `NODE_ENV=production`, and the fare variables. Do not run migrations or seed on every serverless cold start.
3. Apply the checked-in schema from a trusted shell: `cd backend && npm ci && npm run prisma:migrate`. Run `npm run seed` only for a demo database; the seeded `tesla123` accounts are not suitable for a real public deployment.
4. Create the frontend Vercel project with **Root Directory** `frontend`. Set `BACKEND_API_URL` to the deployed API origin and keep `NEXT_PUBLIC_API_URL=/api/backend` so the Next.js same-origin rewrite avoids browser CORS configuration.
5. Verify the API `https://YOUR-BACKEND.vercel.app/health`, frontend login, and the `/api/backend` proxy before sharing the URL.

The repository's Docker Compose files remain useful for local development and database-backed integration tests, but they are not part of the Vercel deployment path. Full step-by-step instructions are in [`docs/vercel-deployment.md`](./docs/vercel-deployment.md).

No live Vercel/API URL is included because deployment credentials and a verified public deployment were not available in this environment. The URL remains an honest TODO rather than a fabricated link.

---

## 📈 If the pool goes viral

The MVP intentionally keeps one API and one relational database. At larger scale, the first bottlenecks would be request-board queries, pool-row contention, and polling fan-out—not the UI. A practical evolution is:

```mermaid
flowchart LR
  UI[Next.js clients] --> LB[Load balancer]
  LB --> API[Stateless API replicas]
  API --> PG[(PostgreSQL primary)]
  API --> CACHE[(Short-lived availability cache)]
  API --> EVENTS[(Lifecycle event stream)]
  EVENTS --> PUSH[SSE/WebSocket gateway]
  PUSH --> UI
  PG --> READ[(Read replicas)]
  API --> OBS[Metrics, traces, audit logs]
```

- **Capacity correctness:** keep the atomic conditional seat update or move claims to a serializable route-policy service; never replace it with a read-then-write check. Add idempotency keys to driver assignment mutations.
- **Compatibility validation:** move zone/corridor heuristics to PostGIS/geohash indexes, then version the corridor policy and retain the driver's selection plus validation decision in the audit trail.
- **Scale reads:** add read replicas for history and a carefully invalidated cache for the driver's waiting-request board; never cache a stale capacity decision as authoritative.
- **Live updates:** publish committed lifecycle events to SSE/WebSockets while retaining polling as a reconnect/fallback path.
- **Reliability:** add rate limits, request tracing, idempotent consumers, dead-letter handling, backups, and database connection-pool tuning.
- **Deployment:** run multiple stateless API replicas behind a load balancer, use managed PostgreSQL with point-in-time recovery, and deploy the frontend independently.
---

## 🤖 AI Usage

OpenCode was used as the implementation assistant for repository inspection, API contract alignment, React/Next.js UI implementation, test fixtures, Vercel deployment preparation, optional Docker configuration, and documentation drafting. I reviewed the changes and ran the checks listed above; the implementation remains grounded in the existing Express/Prisma architecture and local evidence.

- **Accepted suggestion:** keep capacity enforcement in one atomic conditional database update and run the same transaction through membership/status/fare writes. This directly supports the last-seat race and avoids a misleading frontend-only guard.
- **Rejected/changed suggestion:** do not add a map provider, WebSocket service, queue, or generic component library for this MVP. The brief explicitly values a simple area/corridor model and five-second polling, so those additions would increase infrastructure without improving the required evaluator story.

---

## 🎬 Demo Video

**Not recorded yet — honest placeholder.** Add a verified six-minute walkthrough URL after recording passenger request → driver manual passenger selection → final-seat rejection → driver lifecycle → scoped history. No live or fabricated video URL is included.
