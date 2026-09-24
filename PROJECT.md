PRD source: https://docs.google.com/document/d/1JXwdweh9lJgKapQtvcGDF4Bg2GdTnuPxeXL_RDwkfc8/edit

# Dhaka Tesla Pool

A full-stack 3-seat ride-pooling MVP for Dhaka. Passengers request and track their own rides, compatible requests can share Bullet, individual fares remain private, and PostgreSQL enforces seat capacity atomically. The public path is Vercel + managed PostgreSQL; Docker is optional for local development and integration tests.

> **Day 2 status:** core product work is implemented locally. Passenger request/status flows, privacy-safe live activity, driver-only assignment, the last-seat rejection edge case, integration hardening, Vercel-ready configuration, screenshots, and documentation are present. Public deployment, release branches/tag, and the six-minute video are still pending.

## Product status

### Implemented

- [x] JWT signup/login for passengers and drivers
- [x] Driver signup provisions an offline capacity-3 vehicle
- [x] Dhaka area list with no paid map/API dependency
- [x] Hand-testable whole-Taka fare estimate and breakdown
- [x] Passenger request, private status/fare polling, cancellation, and history
- [x] Privacy-safe live booking activity with anonymous route hints
- [x] Driver online/offline, compatible request feed, manual pool creation, and active-pool additions
- [x] Server-side lifecycle transitions and ride-event audit trail
- [x] Atomic seat claim plus database capacity `CHECK`
- [x] One-active-pool-per-vehicle enforcement (API check + partial unique index)
- [x] Next.js responsive UI with loading, error, empty, and full-capacity states
- [x] Vercel-ready frontend/API deployment with managed PostgreSQL
- [x] Optional PostgreSQL + API + frontend Docker Compose stack
- [x] Disposable integration-test database and frontend smoke script
- [x] Architecture, ERD, setup, decisions, AI usage, screenshots, and scaling notes

### Remaining

- [ ] Verified public deployment URL
- [ ] `pre-release` and `release/v1.0.0` branches plus `v1.0.0` tag
- [ ] Six-minute demo video and README video link
- [ ] Optional CI workflow if time remains

## Run the project

### Vercel + managed PostgreSQL (deployment path)

See [`docs/vercel-deployment.md`](./docs/vercel-deployment.md). Docker is not required for deployment.

### Optional local Docker stack

```bash
docker compose up --build
```

Then open:

- Frontend: <http://localhost:3000>
- API health: <http://localhost:4000/health>
- PostgreSQL: `localhost:5432`

The API container runs `prisma migrate deploy` and the idempotent story-cast seed before starting.

### Separate processes

```bash
# terminal 1
cd backend
npm ci
npx prisma generate
npm run dev

# terminal 2
cd frontend
npm ci
npm run dev
```

Provide `DATABASE_URL`, `JWT_SECRET`, and fare variables from `.env.example`. The frontend uses a same-origin rewrite at `/api/backend/*`; set `BACKEND_API_URL=http://localhost:4000` in `frontend/.env.local`.

## Demo cast

All seeded accounts use password `tesla123`.

| Role | Email | Story use |
|---|---|---|
| Driver | `jashim@dhakatesla.bd` | Owns Bullet, capacity 3 |
| Passenger | `nusrat@dhakatesla.bd` | Banani → Mohakhali |
| Passenger | `rafiq@dhakatesla.bd` | Banani → Gulshan 1 |
| Passenger | `shirin@dhakatesla.bd` | Jashim assigns the protected final seat |

## Architecture

```text
Browser
  → Next.js 14 App Router (passenger + driver UI) on Vercel
  → same-origin /api/backend rewrite
  → Express + TypeScript API on Vercel
  → Prisma transaction / atomic seat claim
  → managed PostgreSQL
```

No Redis, Kafka, Kubernetes, queue, map provider, or real payment gateway is used.

## Repository map

```text
.
├── backend/
│   ├── prisma/              # schema, migration, story-cast seed
│   ├── src/routes/          # auth, rides, driver, pool membership
│   ├── src/lib/             # fare, matching, transitions, errors
│   └── tests/               # Vitest + Supertest
├── frontend/
│   ├── app/                 # /, /passenger, /driver
│   ├── components/          # role dashboards and shared UI
│   ├── lib/api/             # typed client and response contracts
│   ├── scripts/smoke.mjs    # production-shaped local smoke check
│   └── Dockerfile
├── docs/screenshots/        # desktop and mobile product captures
├── docker-compose.yml       # optional local DB + API + frontend
├── docker-compose.test.yml  # optional disposable PostgreSQL integration tests
├── docs/vercel-deployment.md # Vercel + managed PostgreSQL guide
├── read.md                  # PRD deep analysis
├── plan.md                  # 2-day plan and honest completion status
├── PROJECT.md               # project status and quick start
└── README.md                # full submission documentation
```

## Verification

Commands currently used:

```bash
# backend
cd backend
npm run typecheck
npm run build
npm run test:unit
docker compose -f docker-compose.test.yml up --build --exit-code-from api-test

# frontend
cd frontend
npm run typecheck
npm run build
npm run test:smoke   # while the full stack is running on :3000
```

The integration suite covers capacity, state transitions, fares, ownership/privacy, cancellation, concurrent last-seat claims, driver provisioning, active-pool additions, privacy-safe activity, and deterministic full-pool rejection.

Latest local verification:

- [x] Backend TypeScript typecheck and production build
- [x] Frontend TypeScript typecheck and optimized Next.js build
- [x] Disposable PostgreSQL integration suite: **46/46 tests passed**
- [x] Full Compose stack: DB, API, and frontend all report healthy
- [x] Frontend smoke: page render, same-origin rewrite, driver board, scoped history, and private activity
- [ ] Public deployment smoke test (no public URL yet)
- [ ] Recorded demo video (not yet created)

## Important decisions

- **PostgreSQL + Prisma:** relational integrity and a real atomic conditional update are more valuable here than a lightweight embedded database.
- **Whole Taka:** integer money avoids floating-point drift and stays easy to verify by hand.
- **Same-pickup or nearby endpoint rule:** deterministic and map-free; it validates every driver selection before assignment.
- **Five-second polling:** simpler and more reliable than introducing WebSockets into a two-day MVP.
- **No frontend-only capacity guard:** the database mutation is always authoritative.

## Working documents

- [`README.md`](./README.md) — submission-facing documentation, API, diagrams, screenshots, deployment notes, AI usage, and scaling
- [`plan.md`](./plan.md) — hour-by-hour 2-day plan with completed and pending work
- [`read.md`](./read.md) — PRD analysis, rubric, risks, and hard invariants
- [`docs/screenshots/`](./docs/screenshots/) — real local product captures
