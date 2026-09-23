import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { errors } from "../lib/errors";
import { signToken } from "../middleware/auth";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const signupSchema = credentialsSchema.extend({
  name: z.string().min(1).max(80),
  role: z.enum(["passenger", "driver"]),
});

/** POST /auth/signup */
authRouter.post("/signup", async (req, res, next) => {
  try {
    const body = signupSchema.parse(req.body);

    const existing = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });
    if (existing) throw errors.conflict("EMAIL_TAKEN", "Email already registered");

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        passwordHash: await bcrypt.hash(body.password, 10),
        role: body.role,
      },
    });

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

    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
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
