# Dhaka Tesla Pool — Deep Analysis of the PRD

> **Source:** [Google Doc — Dhaka_Tesla_Pool_PRD_Internship](https://docs.google.com/document/d/1JXwdweh9lJgKapQtvcGDF4Bg2GdTnuPxeXL_RDwkfc8/edit?tab=t.0)
> **Issued by:** RoBenDevs
> **Type:** Internship take-home engineering challenge
> **Deliverable:** A full-stack, Dockerized ride-pooling MVP + git history + 6-minute video

---

## 1. One-Line Summary

Build a **3-seat ride-pooling MVP** for Dhaka where passengers request rides, a driver (Jashim in "Bullet") accepts them, compatible requests share one vehicle, each passenger sees only their own fare/status, and the whole thing ships with honest git history, tests, Docker, docs, and a 6-minute video — **with AI allowed but full ownership required**.

---

## 2. The Story (Why It Exists)

The brief is deliberately narrative-driven:

| Time | Event |
|---|---|
| 8:41 AM, Banani Road 11 | Jashim leans against **Bullet** — a 3-seat, battery-powered, "entirely unaffiliated Tesla" |
| +0 min | **Nusrat** books Banani → Mohakhali (late for work) |
| +2 min | **Rafiq**, a stranger, books Banani → Gulshan 1 (overlapping, not identical route) |
| +~30 sec later | **Shirin** tries to grab the last seat |

**The core tension:** the app must decide *in about a second* whether strangers can share a seat, split fare fairly, and not make it weird — while Jashim just wants to know who's riding and when he can go.

**Explicit instruction:** *Use this cast (Jashim, Nusrat, Rafiq, Shirin, Bullet) — or your own consistent cast — in seed data, tests, and demo. Never `user1`/`driver1`.*

---

## 3. The Three Actors & Their Requirements

### 3.1 Passenger (Nusrat, Rafiq, Shirin)
- Sign up / sign in
- Request a ride: **pickup, destination, seats**
- See **estimated fare** before committing
- Track status: `waiting → matched → in progress → completed/cancelled`
- View ride history
- Cancel **while the ride state still allows it**

### 3.2 Driver / Tesla (Jashim, Bullet)
- Sign in; toggle **online / offline**
- Own a Tesla with **fixed capacity** (Bullet = 3 seats)
- See **relevant** ride requests; accept a ride/pool
- Advance the ride: **mark arrival → start → complete**
- See assigned passengers, seat usage, and ride history

### 3.3 Ride / Pool Split
- Multiple requests may share one Tesla
- **Occupied seats must never exceed capacity** ← hard invariant
- Each passenger gets an **individual fare**
- Clear lifecycle + obvious pool membership
- **Each passenger sees only their own fare and status — never anyone else's** ← privacy invariant

### 3.4 Suggested State Machine
```
REQUESTED → MATCHED/ACCEPTED → DRIVER_ARRIVED → STARTED → COMPLETED
                                                        ↘ CANCELLED
```
> The doc says *"improve it if you can explain why."* Adding e.g. `CANCELLED_BY_DRIVER`, `NO_SHOW`, or splitting `MATCHED` from `ACCEPTED` is fine **if you justify it**. Illegal transitions must be rejected (this is tested).

---

## 4. Constraints That Shape the Design

| Area | Constraint | Why it matters |
|---|---|---|
| **Geography** | No map APIs. Use a predefined list of Dhaka areas (Banani, Gulshan, Mohakhali, Dhanmondi, Mirpur, Uttara, Farmgate, Bashundhara…) or plain lat/long. Invent & **document a matching rule** (e.g., same pickup zone or compatible corridors) | Saves time; forces you to document a deterministic rule |
| **Fare** | `passengerFare = baseFare + distanceCharge − poolDiscount`. Hand-testable. Explain **money storage** (integer Taka vs decimal) and why | Evaluator will compute Nusrat's & Rafiq's fare by hand |
| **Payment** | Cash or simulated **TeslaPay** wallet. No real gateway | Simplicity |
| **Routing** | Not evaluated — *"not a Google Maps rebuild"* | Don't over-invest |
| **Money/infra** | **Never pay** for anything | Free tiers only, or document the constraint + give reproducible Docker deploy |

---

## 5. Mandated Stack

| Layer | Mandate | Notes |
|---|---|---|
| Frontend | **React or Next.js** | Next.js App Router recommended; plain React + router acceptable |
| Backend | **Node.js** | Express / NestJS / Fastify — **must justify in README** |
| Database | **Your choice** | Relational (Postgres/MySQL/SQLite) *recommended* — pooling/capacity is relational. **Must justify** |
| Tooling | Your choice | ORM, validation, auth, tests, hosting — **all justified in README** |

### Backend must demonstrate
API/resource design · auth · validation · business-logic placement · error handling · ride state transitions · **pool capacity enforcement** · data consistency · code organization · logging · basic security. REST/GraphQL — explain the pick.

### Frontend must demonstrate
Correct flows/states · **loading / error / empty states** · component organization · API integration · usability. *Simple and clean is enough.*

### Database must demonstrate
Self-designed schema: users, vehicles+capacity, ride requests, pools, pool membership, status/history, fare, optional payment/rating/audit. Proper **relationships, constraints, indexes, types**. Be ready to explain **every table**.

### Docker — non-negotiable
`docker compose up` must bring up: app container(s) + DB container + `.env.example` + migrations + seed data (the story cast) + health checks if possible.

### Deployment
Free tier preferred & public. If impossible, **document the constraint** and provide reproducible Docker deployment.

---

## 6. Non-Mandated Choices Need Defense (Section 7)

For **every** non-mandated choice (DB, ORM, auth, styling, tests, hosting) the README must state:

1. **What** you picked **and the realistic alternatives**
2. **Why** it fits a *ride-pooling MVP specifically*
3. **What would make you switch later**

> *"A trendy stack you can't defend earns nothing extra — and will cost you in the interview."*

---

## 7. AI Usage Policy (Section 8)

- **AI is explicitly allowed**: ChatGPT, Claude, Copilot, Cursor, docs, Stack Overflow.
- **Do not hide it.** Hiding is penalized.
- **You own every line**: be ready to explain, debug, redesign, or modify any part *live* — auth, pooling/capacity enforcement, failure modes, schema rationale.
- **README "AI Usage" section must include:**
  - Which tools, used for what
  - **One accepted** suggestion
  - **One rejected/changed** suggestion, and why

> Scoring is *engineering understanding*, not "least AI used."

---

## 8. Architecture-First (Section 9)

Before implementing, produce an **architecture diagram** (Mermaid / Excalidraw / draw.io / image) showing at minimum:

```
Browser → Next.js/React → Node.js API → Database
```

Plus an **ERD**. Implementation must broadly match the docs — *update docs if it changes*.

**Anti-pattern called out:** do **not** add microservices, Kafka, Kubernetes, Redis, or queues *just to look advanced*. Complexity only with a reason.

---

## 9. Git Workflow — Scored, Not Optional (Sections 10–11)

### Required branches
```
master          (long-lived, integration)
pre-release     (long-lived, integration fixes / docs / deploy checks)
release/v1.0.0  (the version shown in video/deployment)
feature/*       (e.g. feature/passenger-auth, feature/tesla-pooling, feature/driver-flow)
```

### Flow
```
feature/<x>  (incremental commits)
     │  works
     ▼
  master  ── all MVP features integrated ──▶  pre-release  (integration fixes, docs, deploy)
                                                 │
                                                 ▼
                                           release/v1.0.0  ← shown in video/deployment
```

> *"A perfect final repo with a meaningless history is weaker than a good repo showing a real engineering journey."*

### Commit format
```
<type>(<scope>): <short description>
types: feat | fix | refactor | test | docs | chore | build
```
**Good:**
```
feat(auth): add passenger login endpoint
feat(pool): enforce Bullet's seat capacity
fix(pool): prevent overbooking available seats
build(docker): add compose setup for api and postgres
```
**Bad:** `update` / `changes` / `fix` / `final` / `latest` / `working now` / `asdf`
**Also bad:** fifty meaningless micro-commits just to satisfy the rule. *One commit = one understandable logical change.*

---

## 10. README, Testing, Concurrency, Bonus (Section 12)

### README checklist (minimum)
- [ ] Summary, problem statement, features implemented, screenshots/GIFs
- [ ] Architecture diagram **and** ERD
- [ ] Tech stack, project structure, prerequisites
- [ ] Environment variables (`.env.example`, **never real secrets**)
- [ ] Local setup, Docker instructions, migration/seed instructions
- [ ] How to run frontend/backend/tests; **demo credentials**
- [ ] Deployment URL, API overview, key decisions/trade-offs, known limitations, next improvements
- [ ] **AI Usage section** + **demo video link**

### Must-test behaviors (meaningful, not coverage-chasing)
1. **Bullet's capacity can never be exceeded**
2. Invalid state transitions are rejected
3. Nusrat's and Rafiq's **pooled fares calculate correctly**
4. Users **cannot modify another user's ride** (authorization)
5. Cancellation rules hold
6. **Two concurrent requests can't corrupt pool capacity**

### ⚠️ The Concurrency Problem (expect it in interview)
> *Bullet has 1 seat left. Nusrat and Shirin both try to claim it at nearly the same instant; both initially see one seat available.*

- MVP doesn't need a distributed solution.
- **Document** how you handle it now (e.g., DB transaction + `SELECT … FOR UPDATE` / serializable isolation / atomic conditional `UPDATE … WHERE seats_taken < capacity` with a row count check) **and** what you'd change at scale (row locks vs optimistic versioning, Redis/queue, single-writer service).

### Bonus: "If Oi Tesla Goes Virals" (1M passengers / 100k drivers)
Reason through: load balancing · horizontal scaling · DB indexing & read replicas · caching · geospatial search (PostGIS / quadkeys / geohash) · queues/events · real-time (WebSocket/SSE) · rate limiting · idempotency · observability · DB contention · ride matching · retry/failure strategy · security · deployment strategy.
**A diagram is encouraged; reasoning matters more than box count.**

---

## 11. Six-Minute Video (Section 13)

Max 6 minutes (Loom or similar, free), **linked prominently in the README**:

| Timestamp | Content |
|---|---|
| **0:00–1:00** | Your understanding of the problem, users, core idea — *in your own words, don't recite the PRD* |
| **1:00–3:00** | How you engineered it: architecture, backend, frontend, DB design, ride/pool lifecycle, **one key decision, one trade-off** — show the architecture/ERD while explaining |
| **3:00–6:00** | Product tour: passenger flow, driver flow, shared-Tesla/pooling, fare/status, **one interesting edge case**, deployment if available |

---

## 12. Submission Checklist (Section 14)

- [ ] Public/evaluator-accessible repo with working MVP (frontend + backend + database)
- [ ] Docker setup, `.env.example`, **no secrets committed**
- [ ] Migrations + seed/demo data using the **story cast**
- [ ] Architecture diagram **and** ERD
- [ ] `master` / `pre-release` / `release/v1.0.0` branches with meaningful, incremental history
- [ ] Tests for important behavior + self-explanatory README + deployment link if available
- [ ] Six-minute video link, AI Usage section, viral-scale bonus if attempted

---

## 13. Evaluation Rubric (Section 15)

| Dimension | What they check |
|---|---|
| **Product** | Understood the problem, sensible assumptions |
| **Process** | Followed instructions, git engineering, traceability |
| **Backend / DB** | API/state/validation design; modeling, constraints, integrity |
| **Frontend** | Correct flows/states, integration, maintainability |
| **Docker / Deploy** | Runs reliably elsewhere; *shipped, not just coded* |
| **Testing / Docs** | Tested what's risky; another engineer can operate it |
| **Ownership** | Can explain, defend, and change your own code |

> **Explicit warning:** *"Following instructions is a major, explicit part of the score — 120 features with a broken process can score lower than a small, clean MVP that follows it properly."*

---

## 14. What NOT To Do (Section 16)

- ❌ Pay for infrastructure/services
- ❌ Commit API keys, passwords, tokens, or `.env` secrets
- ❌ Submit a single giant `initial commit` with the finished system
- ❌ Push all feature development directly to `master`
- ❌ Add technologies just to make the diagram look impressive
- ❌ Polish animations while core data integrity is broken
- ❌ Hide AI usage, or include code you cannot explain
- ❌ Strip the story cast out of seed data/tests/README for generic placeholders

---

## 15. Assumptions Are Allowed (Sections 17–18)

Some requirements are intentionally vague. The expected behavior:

> **Make a reasonable assumption → document it → implement it consistently → be ready to explain it.**

*"Why did you assume that?"* is not a trap — it's how they evaluate your thinking. Copy-pasted answers fall apart exactly here.

**The bar:** `Understand → Design → Build → Commit → Test → Ship → Explain → Debug → Change`

---

## 16. Deep Analysis — Where the Real Difficulty Lives

Ranked by how likely they are to differentiate candidates:

### 🔴 Tier 1 — Hard invariants (fail = big penalty)
1. **Capacity never exceeded under concurrency.** The seat claim must be atomic. A naive `SELECT seats → check → UPDATE` in two requests = overbooking. This is the single most-quoted technical problem in the brief.
2. **State machine integrity.** Every transition guarded server-side; illegal transitions rejected with proper errors. Frontend must not be the only guard.
3. **Per-passenger data isolation.** Passenger A must never see Passenger B's fare/status. Requires careful scoping of queries + authorization middleware, not just UI hiding.
4. **No secrets in git, no giant initial commit, no direct-to-master feature work.** Process violations are *explicitly scored*.

### 🟠 Tier 2 — Judgement signals
5. **Fare transparency.** Hand-calculable formula, documented money storage (integer Taka avoids float drift; state that), pool discount logic that splits fairly when 2 of 3 seats are taken.
6. **Documented matching rule.** Nusrat (Banani→Mohakhali) and Rafiq (Banani→Gulshan 1) overlap but differ — your rule must deterministically say "yes, these share" and be applied consistently. Shirin's late arrival must hit the *capacity* path, not break it.
7. **Justification discipline.** Every non-mandated choice needs *pick / alternative / why / when to switch*. This is graded in README **and** probed live.
8. **Schema explainability.** Every table defensible: users, vehicles(capacity), ride_requests, pools, pool_members, ride_events/status history, fares, (optional) payments/ratings/audit.

### 🟡 Tier 3 — Differentiators
9. **Meaningful tests on risky behavior** (the six listed) rather than coverage padding.
10. **Honest AI Usage section** with one accepted and one rejected suggestion — a rejected suggestion proves independent judgement.
11. **Concurrency write-up**: what you do now + what changes at scale.
12. **Scaling reasoning** (bonus): quality of thought > number of boxes.
13. **Video quality**: own-words framing, shows ERD while speaking, includes an edge case (e.g., Shirin arriving when 1 seat remains, mid-ride cancellation, driver going offline).

### Common failure modes to avoid
- Building a map/routing engine → wasted effort, explicitly not evaluated.
- Adding Redis/Kafka/K8s → penalized if unjustified.
- Perfect final commit history → reads as fabricated.
- README written last and vague → fails "another engineer can operate it."
- Only happy path in the frontend → missing loading/error/empty states is called out.

---

## 17. Suggested Build Plan (derived, not from the doc)

A realistic order that produces a *legitimate* git history:

**Phase A — Design**
1. Write assumptions + matching rule + fare formula in `README.md` (draft)
2. Draw ERD + architecture diagram (Mermaid) before coding

**Phase B — Backend (feature branches)**
```
feature/passenger-auth     → signup/login, JWT/session, roles
feature/driver-flow        → online/offline, request feed, accept, lifecycle transitions
feature/tesla-pooling      → capacity enforcement, pool creation/membership, atomic seat claim
feature/fare-engine        → base + distance − poolDiscount, integer Taka
feature/ride-history       → ride_events audit trail, per-user history scoping
test/pool-capacity-concurrency
```

**Phase C — Frontend (feature branches)**
```
feature/passenger-ui   (request → fare estimate → live status → history)
feature/driver-ui      (online toggle → incoming pools → start/complete)
```

**Phase D — Ship**
```
build(docker)  compose + migrations + seeds (Jashim/Nusrat/Rafiq/Shirin/Bullet)
docs(readme)   architecture, ERD, env, setup, AI usage, decisions
→ merge to master → cut pre-release → integration fixes → cut release/v1.0.0
→ record ≤6 min video → link in README
```

**Minimal schema sketch (draft to refine):**
```sql
users(id, name, email, password_hash, role[passenger|driver], created_at)
vehicles(id, driver_id→users, name, capacity, plate, is_online)
areas(id, name, lat, lng)                       -- Banani, Gulshan, ...
ride_requests(id, passenger_id→users, pickup_area_id, dest_area_id,
              seats_requested, status, created_at)
pools(id, vehicle_id→vehicles, status, capacity_snapshot, started_at, completed_at)
pool_members(id, pool_id→pools, request_id→ride_requests, seats, fare_taka, status)
rides/events(id, pool_id, from_status, to_status, actor_id, at)   -- audit trail
fares(id, request_id, base_taka, distance_taka, discount_taka,
      total_taka, currency)                   -- integer Taka, no floats
payments(id, fare_id, method[cash|teslapay], status)
```
**Concurrency guard (candidate answer):**
```sql
BEGIN;
SELECT seats_taken FROM pools WHERE id=$1 FOR UPDATE;
-- or atomic: UPDATE pools SET seats_taken = seats_taken + $n
--   WHERE id=$1 AND seats_taken + $n <= capacity RETURNING *;
-- 0 rows returned ⇒ rejected: "no seats left"
COMMIT;
```

---

## 18. Final Words From the Brief

> *"We wrote this brief with specific people and a specific vehicle for a reason: it's a lot harder to fake your way through a story than a spec sheet."*

> *"In Dhaka, your Tesla may have three wheels — but your engineering should still be production-minded."*
>
> — **RoBenDevs** · *Good luck, Chief Tesla Engineer.*
