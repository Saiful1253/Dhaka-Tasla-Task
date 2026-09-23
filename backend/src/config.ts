export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-secret-change-me",
  jwtExpiresIn: "7d",

  fare: {
    /** base fare in whole Taka (৳50) */
    baseFareTaka: Number(process.env.BASE_FARE_TAKA ?? 50),
    /** per-km charge in whole Taka (৳15/km) */
    ratePerKmTaka: Number(process.env.RATE_PER_KM_TAKA ?? 15),
    /** pool discount percent applied when poolSize >= 2 (20%) */
    poolDiscountPct: Number(process.env.POOL_DISCOUNT_PCT ?? 20),
  },

  matching: {
    /** two requests with different pickups may pool if pickups are within this radius */
    pickupRadiusKm: 2.5,
    /** ...and their destinations are within this radius */
    destRadiusKm: 4.0,
  },
};
