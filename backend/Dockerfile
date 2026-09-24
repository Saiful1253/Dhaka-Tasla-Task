# ---- build + integration-test stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY tests ./tests
RUN npx prisma generate && npm run build

# Disposable test database tests run through this explicit target. The compose
# test stack supplies an internal PostgreSQL URL and destructive-test opt-in.
FROM build AS test
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && npm test"]

# ---- production runtime ----
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

COPY --from=build /app/dist ./dist

# migrate + idempotent seed + start
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --retries=12 \
  CMD wget -qO- http://localhost:4000/health > /dev/null || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && npm run seed && npm start"]
