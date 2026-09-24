# Vercel deployment (Docker optional)

Dhaka Tesla Pool can run on Vercel without Docker:

```text
Browser → Next.js (Vercel) → /api/backend rewrite → Express (Vercel) → managed PostgreSQL
```

The repository already has the required entry points and Prisma migrations. The backend project uses `backend/api/index.ts` plus `backend/vercel.json`; the frontend project uses the Next.js app in `frontend/`.

## 1. Create the database

Create a PostgreSQL database with Vercel Postgres, Neon, Supabase, or another managed provider. Keep the provider URL private.

For the backend Vercel project set:

```env
DATABASE_URL=postgresql://...        # provider's pooled/runtime URL
JWT_SECRET=generate-a-long-random-secret
NODE_ENV=production
BASE_FARE_TAKA=50
RATE_PER_KM_TAKA=15
POOL_DISCOUNT_PCT=20
```

Use the provider's direct/non-pooling URL for the one-time migration command if the provider separates the two URLs. Never put the database URL in a `NEXT_PUBLIC_*` variable.

## 2. Import the backend

Create one Vercel project from the GitHub repository with:

- **Root Directory:** `backend`
- **Framework:** Node.js (`api/index.ts` is the serverless function entry)
- **Install/Build:** the repository defaults (`npm install`, `npm run build`)

The backend `postinstall` script runs `prisma generate`, so the Prisma client is available in the Vercel build. `vercel.json` rewrites API requests to the checked-in Express function. The server is stateless; do not run migrations or seed data during every cold start.

## 3. Apply the database schema

From a trusted local shell (or a one-off CI job), with the same database selected:

```bash
cd backend
npm ci
npm run prisma:migrate
```

The checked-in `prisma/migrations/` directory is the source of truth. Do not run `prisma migrate dev` against a production database.

The seed is optional and is intended for a demo environment only:

```bash
npm run seed
```

Do not use the seeded `tesla123` credentials for a real public deployment. If the database already contains the schema/SQL, skip the migration command after verifying the migration history.

Deploy the backend and verify:

```text
https://YOUR-BACKEND.vercel.app/health
```

The response should be JSON containing `"status":"ok"`.

## 4. Import the frontend

Create a second Vercel project from the same repository with:

- **Root Directory:** `frontend`
- **Framework:** Next.js
- **Install/Build:** the repository defaults (`npm install`, `npm run build`)

Set these frontend environment variables:

```env
BACKEND_API_URL=https://YOUR-BACKEND.vercel.app
NEXT_PUBLIC_API_URL=/api/backend
```

Keep `NEXT_PUBLIC_API_URL` as the same-origin path. The Next.js rewrite in `frontend/next.config.mjs` sends `/api/backend/*` to `BACKEND_API_URL`; this avoids browser CORS configuration and keeps the JWT in the existing request flow.

Deploy the frontend and verify the public site, login, and the API proxy.

## CLI alternative

After linking each project to the correct directory:

```bash
cd backend
vercel env pull .env.local
vercel --prod

cd ../frontend
vercel env pull .env.local
vercel --prod
```

Set the environment variables in Vercel first, then deploy. The Git integration is usually simpler: push the branch and let Vercel build the two configured projects.

## Docker is optional

Docker Compose remains useful for a reproducible local stack and database-backed integration tests, but it is **not required for Vercel deployment**. The public deployment path is Vercel + managed PostgreSQL.
