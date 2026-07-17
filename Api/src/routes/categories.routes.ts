import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const categoriesRouter = Router();

const paramsSchema = z.object({
  shopId: z.string().min(1),
});

const categorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required."),
});

categoriesRouter.use(requireAuth);

categoriesRouter.get("/:shopId/categories", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);

    await assertUserOwnsShop(authUser.id, shopId);

    const categories = await prisma.category.findMany({
      where: { shopId },
      orderBy: { name: "asc" },
    });

    response.status(200).json({ categories });
  } catch (error) {
    next(error);
  }
});

categoriesRouter.post("/:shopId/categories", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const input = categorySchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);

    const category = await prisma.category.create({
      data: {
        name: input.name,
        shopId,
      },
    });

    response.status(201).json({ category });
  } catch (error) {
    next(error);
  }
});

categoriesRouter.patch("/:shopId/categories/:categoryId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const categoryId = z.string().min(1).parse(request.params.categoryId);
    const input = categorySchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);

    const existingCategory = await prisma.category.findFirst({
      where: { id: categoryId, shopId },
      select: { id: true },
    });

    if (!existingCategory) {
      const error = new Error("Category not found.");
      error.name = "NotFoundError";
      throw error;
    }

    const category = await prisma.category.update({
      where: { id: categoryId },
      data: { name: input.name },
    });

    response.status(200).json({ category });
  } catch (error) {
    next(error);
  }
});

categoriesRouter.delete("/:shopId/categories/:categoryId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const categoryId = z.string().min(1).parse(request.params.categoryId);

    await assertUserOwnsShop(authUser.id, shopId);

    const existingCategory = await prisma.category.findFirst({
      where: { id: categoryId, shopId },
      select: { id: true },
    });

    if (!existingCategory) {
      const error = new Error("Category not found.");
      error.name = "NotFoundError";
      throw error;
    }

    await prisma.category.delete({ where: { id: categoryId } });

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
