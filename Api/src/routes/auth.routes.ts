import bcrypt from "bcrypt";
import { Router } from "express";
import { z } from "zod";

import { signAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth.middleware.js";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  shopName: z.string().trim().min(1, "Shop name is required."),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1, "Password is required."),
});

authRouter.post("/register", async (request, response, next) => {
  try {
    const input = registerSchema.parse(request.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      response.status(409).json({ message: "Email is already registered." });
      return;
    }

    const hashedPassword = await bcrypt.hash(input.password, 12);

    const { user, shop } = await prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: {
          name: input.name,
          email: input.email,
          password: hashedPassword,
        },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const createdShop = await transaction.shop.create({
        data: {
          name: input.shopName,
          ownerId: createdUser.id,
          setting: {
            create: {},
          },
        },
        include: { setting: true },
      });

      return { user: createdUser, shop: createdShop };
    });

    const token = signAccessToken({ userId: user.id, email: user.email });

    response.status(201).json({ user: { ...user, shops: [shop] }, shop, token });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (request, response, next) => {
  try {
    const input = loginSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      response.status(401).json({ message: "Invalid email or password." });
      return;
    }

    const passwordMatches = await bcrypt.compare(input.password, user.password);

    if (!passwordMatches) {
      response.status(401).json({ message: "Invalid email or password." });
      return;
    }

    const token = signAccessToken({ userId: user.id, email: user.email });

    const shops = await prisma.shop.findMany({
      where: { ownerId: user.id },
      include: { setting: true },
      orderBy: { createdAt: "desc" },
    });

    response.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        shops,
      },
      token,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuth, async (request, response, next) => {
  try {
    const authRequest = request as AuthenticatedRequest;

    const user = await prisma.user.findUnique({
      where: { id: authRequest.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        shops: {
          orderBy: { createdAt: "desc" },
          include: { setting: true },
        },
      },
    });

    if (!user) {
      response.status(404).json({ message: "User not found." });
      return;
    }

    response.status(200).json({ user });
  } catch (error) {
    next(error);
  }
});
