# Dhaka Tesla Pool 🚗⚡

> Share a seat. Split the fare. Survive Dhaka traffic.

An MVP ride-pooling service for Dhaka where passengers can request a ride, share a 3-seat electric "Tesla" with compatible strangers, split the fare fairly, and the driver always knows who's riding and at what stage.

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
- [Docker Instructions](#-docker-instructions)
- [Running Tests](#-running-tests)
- [Demo Credentials](#-demo-credentials)
- [API Overview](#-api-overview)
- [Key Decisions & Trade-offs](#-key-decisions--trade-offs)
- [Known Limitations](#-known-limitations)
- [Next Improvements](#-next-improvements)
- [AI Usage](#-ai-usage)
- [Demo Video](#-demo-video)

---

## 📝 Summary

**Dhaka Tesla Pool** is a full-stack ride-pooling MVP. One driver (Jashim) with one 3-seat vehicle (Bullet) can carry multiple passengers whose trips overlap. Passengers see only *their own* fare and status; the driver sees everyone assigned to the ride. Every state change is guarded server-side and recorded in an audit trail.

**Problem:** Nusrat wants Banani → Mohakhali, Rafiq wants Banani → Gulshan 1, and 30 seconds later Shirin wants the last seat. In about a second the system must decide whether these strangers can share a seat, at what fare, without ever exceeding Bullet's 3 seats — even when two requests arrive at the exact same instant.

> 🚧 **Status:** Day 1 — Blueprint complete. Backend in progress.

---

## 🧩 Features Implemented

- [ ] Passenger sign-up / sign-in (JWT)
- [ ] Driver sign-up / sign-in (JWT) + online/offline toggle
- [ ] Ride request: pickup area, destination area, seats
- [ ] Fare estimate (hand-testable breakdown)
- [ ] Ride lifecycle with server-side state guard
- [ ] Pool creation + **atomic seat-capacity enforcement**
- [ ] Corridor/zone matching rule
- [ ] Per-passenger fare & status isolation
- [ ] Ride history + audit trail (`ride_events`)
- [ ] Cancellation while in a valid state
- [ ] Seed data with the story cast
- [ ] Docker Compose setup
- [ ] Tests (capacity, transitions, fare, authz, cancellation, concurrency)

---

## 📌 Assumptions

Some requirements were intentionally left open. These are the assumptions made, documented, and applied consistently:

1. **Matching rule:** two requests may share a vehicle if they have the **same pickup area** *OR* their pickup→destination corridors overlap (both heading the same general direction). Nusrat (Banani→Mohakhali) and Rafiq (Banani→Gulshan 1) both start in Banani heading south/east → compatible. Shirin matches the corridor but is bounded by remaining seats.
2. **Money is stored as integer paisa (৳ × 100).** No floats/decimals — avoids floating-point drift, keeps the fare exactly hand-verifiable, and scales cleanly if the currency ever had sub-unit precision.
3. **Cancellation is allowed only in `REQUESTED` or `MATCHED`** (i.e. before the driver arrives). Once `DRIVER_ARRIVED` the trip is considered committed; only the driver/admin could cancel.
4. **One active pool per vehicle at a time.** A vehicle's pool must reach `COMPLETED`/`CANCELLED` before a new one opens — keeps capacity accounting trivial and correct.
5. **No real payment gateway.** Payment is Cash or a simulated **TeslaPay** wallet.
6. **No map API.** Pickup/destination are a predefined list of Dhaka areas (`areas` table) with lat/lng centers; distance is computed with the Haversine formula between zone centers. This matches the brief's "keep geography simple" rule and keeps everything free and hand-testable.

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

    subgraph Ops["📦 Docker Compose"]
        C1["api container"] ~~~ C2["postgres + healthcheck"]
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
        int    fare_paisa   "individual fare"
    }
    FARES {
        int    id PK
        int    request_id FK
        int    base_paisa
        int    distance_paisa
        int    discount_paisa
        int    total_paisa  "integer paisa, no floats"
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
pool_members(id, pool_id, request_id, seats, fare_paisa, status)
fares(id, request_id, base_paisa, distance_paisa, discount_paisa, total_paisa)
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
subtotal_paisa  = baseFare + round(distance_km * ratePerKm)
poolDiscount    = poolSize >= 2 ? subtotal_paisa * DISCOUNT_PCT : 0
passengerFare   = subtotal_paisa - poolDiscount      // stored as INTEGER PAISA
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
| Tooling | Docker Compose | One command bring-up |

> Justification, alternatives, and "what would make me switch" for each: see [Key Decisions & Trade-offs](#-key-decisions--trade-offs).

---

## 📁 Project Structure

```
.
├── frontend/          # Next.js app
├── backend/           # Express API + Prisma
│   ├── prisma/        # schema, migrations, seed
│   └── src/
├── docker-compose.yml
├── .env.example
├── read.md            # PRD deep analysis
└── plan.md            # 2-day build plan
```

---

## 📋 Prerequisites

- Node.js ≥ 20
- Docker + Docker Compose
- (Optional) PostgreSQL 17 if running outside Docker

---

## 🔐 Environment Variables

Copy `.env.example` → `.env`. **Never commit real secrets.**

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dhaka_tesla_pool
JWT_SECRET=change-me
PORT=4000
```

---

## 🚀 Local Setup

```bash
# 1. install
# 2. migrate + seed
# 3. run backend & frontend
```

_(Commands to be filled in as the build progresses — Day 1, Hour 2.)_

---

## 🐳 Docker Instructions

```bash
docker compose up --build
```

_(Coming in Day 1, Hour 2.)_

---

## 🧪 Running Tests

```bash
npm test
```

Tests cover exactly what is risky:
1. Bullet's capacity can never be exceeded
2. Invalid state transitions are rejected
3. Nusrat's and Rafiq's pooled fares calculate correctly
4. Users cannot modify another user's ride
5. Cancellation rules hold
6. Two concurrent requests cannot corrupt pool capacity

---

## 🔑 Demo Credentials

_(Filled by the seed script — Day 1, Hour 7.)_

---

## 🔌 API Overview

_(Filled as endpoints land — Day 1, Hour 8.)_

---

## ⚖️ Key Decisions & Trade-offs

| Decision | Alternative | Why this | When I'd switch |
|---|---|---|---|
| PostgreSQL | MySQL / SQLite | Row locking + FK integrity for capacity; SQLite's locking differs and won't represent production concurrency | Team-standard MySQL, or a pure-embedded demo |
| Atomic conditional `UPDATE` for seat claim | Read-then-write check | Single statement, DB-guaranteed; can't overbook under race | Large scale → distributed lock / dedicated matching service |
| Zone list + Haversine | Google Maps / Leaflet | Brief says don't fight map APIs; free, hand-testable, no keys | Real routing/ETA becomes a requirement |
| JWT (stateless) | Sessions in Redis | No extra infra for an MVP | Need instant revocation → server-side sessions |
| Integer paisa | DECIMAL/float | Exact math, no drift, trivially hand-verifiable | Currency with >2 sub-decimals |

---

## ⚠️ Known Limitations

- Matching is zone/corridor based, not real routing or ETA.
- No real payment gateway (Cash / simulated TeslaPay).
- Real-time status uses polling, not WebSockets.

---

## 🔭 Next Improvements

- PostGIS geospatial matching, read replicas, caching, queue-based matching at scale (see bonus scaling section).

---

## 🤖 AI Usage

_(Tools used, one accepted suggestion, one rejected/changed suggestion — filled before submission.)_

---

## 🎬 Demo Video

_(6-minute Loom link — filled before submission.)_
