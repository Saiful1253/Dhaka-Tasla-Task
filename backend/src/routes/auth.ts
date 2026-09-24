import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma, interactiveTransactionOptions } from "../lib/prisma";
import { errors } from "../lib/errors";
import { signToken } from "../middleware/auth";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6),
});

const signupSchema = credentialsSchema.extend({
  name: z.string().trim().min(1).max(80),
  role: z.enum(["passenger", "driver"]),
});

/** POST /auth/signup */
authRouter.post("/signup", async (req, res, next) => {
  try {
    const body = signupSchema.parse(req.body);
    const normalizedEmail = body.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) throw errors.conflict("EMAIL_TAKEN", "Email already registered");

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: body.name.trim(),
          email: normalizedEmail,
          passwordHash,
          role: body.role,
        },
      });

      // A driver account is only useful when it owns a vehicle. Provision the
      // same capacity-3 default in the same transaction as the user so signup
      // can never leave a newly registered driver with an unusable dashboard.
      if (created.role === "driver") {
        await tx.vehicle.create({
          data: {
            driverId: created.id,
            name: `${created.name.split(/\s+/)[0]}'s Tesla`,
            capacity: 3,
            isOnline: false,
          },
        });
      }

      return created;
    }, interactiveTransactionOptions);

    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token: signToken({ id: user.id, role: user.role }),
    });
  } catch (e) {
    next(e);
  }
});

/** POST /auth/login */
authRouter.post("/login", async (req, res, next) => {
  try {
    const body = credentialsSchema.parse(req.body);
    const normalizedEmail = body.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user) throw errors.invalidCredentials();

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) throw errors.invalidCredentials();

    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token: signToken({ id: user.id, role: user.role }),
    });
  } catch (e) {
    next(e);
  }
});
