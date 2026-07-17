import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth.middleware.js";

export const shopsRouter = Router();

const createShopSchema = z.object({
  name: z.string().trim().min(1, "Shop name is required."),
});

shopsRouter.use(requireAuth);

shopsRouter.get("/", async (request, response, next) => {
  try {
    const authRequest = request as AuthenticatedRequest;

    const shops = await prisma.shop.findMany({
      where: { ownerId: authRequest.user.id },
      include: { setting: true },
      orderBy: { createdAt: "desc" },
    });

    response.status(200).json({ shops });
  } catch (error) {
    next(error);
  }
});

shopsRouter.post("/", async (request, response, next) => {
  try {
    const authRequest = request as AuthenticatedRequest;
    const input = createShopSchema.parse(request.body);

    const shop = await prisma.shop.create({
      data: {
        name: input.name,
        ownerId: authRequest.user.id,
      },
    });

    response.status(201).json({ shop });
  } catch (error) {
    next(error);
  }
});
