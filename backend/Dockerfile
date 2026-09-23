# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma

RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# ---- runtime stage ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma
RUN npm install --omit=dev && npx prisma generate

COPY --from=build /app/dist ./dist

# migrate + seed + start (seed is idempotent via upsert)
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --retries=12 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && npm run seed && npm start"]
