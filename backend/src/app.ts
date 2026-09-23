import express from "express";
import morgan from "morgan";
import { authRouter } from "./routes/auth";
import { rideRouter, areaRouter } from "./routes/rides";
import { driverRouter, membershipRouter } from "./routes/pools";
import { errorHandler, notFoundHandler } from "./middleware/error";

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(
    morgan(process.env.NODE_ENV === "production" ? "combined" : "dev")
  );

  // health check (docker healthcheck hits this)
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "dhaka-tesla-pool-api" });
  });

  app.use("/auth", authRouter);
  app.use(areaRouter);
  app.use("/rides", rideRouter);
  app.use("/driver", driverRouter);
  app.use(membershipRouter);
  app.use("/driver", driverRouter);
  app.use(membershipRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
