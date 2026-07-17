import { Router } from "express";
import { z } from "zod";

import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const productsRouter = Router();

const paramsSchema = z.object({
  shopId: z.string().min(1),
});

const moneySchema = z.coerce.number().int().nonnegative();

const productSchema = z.object({
  name: z.string().trim().min(1, "Product name is required."),
  description: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  price: moneySchema,
  cost: moneySchema.optional(),
  categoryId: z.string().trim().optional(),
  isActive: z.boolean().optional(),
});

const updateProductSchema = productSchema.partial();

const variantSchema = z.object({
  name: z.string().trim().min(1, "Variant name is required."),
  sku: z.string().trim().optional(),
  price: moneySchema.optional(),
  cost: moneySchema.optional(),
  option1: z.string().trim().optional(),
  option2: z.string().trim().optional(),
  option3: z.string().trim().optional(),
  isActive: z.boolean().optional(),
});

const updateVariantSchema = variantSchema.partial();

productsRouter.use(requireAuth);

async function assertCategoryBelongsToShop(categoryId: string | undefined, shopId: string) {
  if (!categoryId) return;

  const category = await prisma.category.findFirst({
    where: { id: categoryId, shopId },
    select: { id: true },
  });

  if (!category) {
    const error = new Error("Category not found.");
    error.name = "NotFoundError";
    throw error;
  }
}

async function assertProductBelongsToShop(productId: string, shopId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, shopId },
    select: { id: true },
  });

  if (!product) {
    const error = new Error("Product not found.");
    error.name = "NotFoundError";
    throw error;
  }
}

productsRouter.get("/:shopId/products", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);

    await assertUserOwnsShop(authUser.id, shopId);

    const products = await prisma.product.findMany({
      where: { shopId },
      include: {
        category: true,
        variants: true,
      },
      orderBy: { createdAt: "desc" },
    });

    response.status(200).json({ products });
  } catch (error) {
    next(error);
  }
});

productsRouter.post("/:shopId/products", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const input = productSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);
    await assertCategoryBelongsToShop(input.categoryId, shopId);

    const data: Prisma.ProductUncheckedCreateInput = {
      name: input.name,
      price: input.price,
      shopId,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.cost !== undefined ? { cost: input.cost } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    };

    const product = await prisma.product.create({
      data,
      include: {
        category: true,
        variants: true,
      },
    });

    response.status(201).json({ product });
  } catch (error) {
    next(error);
  }
});

productsRouter.patch("/:shopId/products/:productId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const productId = z.string().min(1).parse(request.params.productId);
    const input = updateProductSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);
    await assertProductBelongsToShop(productId, shopId);
    await assertCategoryBelongsToShop(input.categoryId, shopId);

    const data: Prisma.ProductUncheckedUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.cost !== undefined ? { cost: input.cost } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    };

    const product = await prisma.product.update({
      where: { id: productId },
      data,
      include: {
        category: true,
        variants: true,
      },
    });

    response.status(200).json({ product });
  } catch (error) {
    next(error);
  }
});

productsRouter.delete("/:shopId/products/:productId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const productId = z.string().min(1).parse(request.params.productId);

    await assertUserOwnsShop(authUser.id, shopId);
    await assertProductBelongsToShop(productId, shopId);

    await prisma.product.delete({ where: { id: productId } });

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

productsRouter.post("/:shopId/products/:productId/variants", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const productId = z.string().min(1).parse(request.params.productId);
    const input = variantSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);
    await assertProductBelongsToShop(productId, shopId);

    const data: Prisma.ProductVariantUncheckedCreateInput = {
      name: input.name,
      productId,
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.cost !== undefined ? { cost: input.cost } : {}),
      ...(input.option1 !== undefined ? { option1: input.option1 } : {}),
      ...(input.option2 !== undefined ? { option2: input.option2 } : {}),
      ...(input.option3 !== undefined ? { option3: input.option3 } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    };

    const variant = await prisma.productVariant.create({
      data,
    });

    response.status(201).json({ variant });
  } catch (error) {
    next(error);
  }
});

productsRouter.patch(
  "/:shopId/products/:productId/variants/:variantId",
  async (request, response, next) => {
    try {
      const authUser = getAuthUser(request);
      const { shopId } = paramsSchema.parse(request.params);
      const productId = z.string().min(1).parse(request.params.productId);
      const variantId = z.string().min(1).parse(request.params.variantId);
      const input = updateVariantSchema.parse(request.body);

      await assertUserOwnsShop(authUser.id, shopId);
      await assertProductBelongsToShop(productId, shopId);

      const existingVariant = await prisma.productVariant.findFirst({
        where: { id: variantId, productId },
        select: { id: true },
      });

      if (!existingVariant) {
        const error = new Error("Product variant not found.");
        error.name = "NotFoundError";
        throw error;
      }

      const data: Prisma.ProductVariantUncheckedUpdateInput = {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.cost !== undefined ? { cost: input.cost } : {}),
        ...(input.option1 !== undefined ? { option1: input.option1 } : {}),
        ...(input.option2 !== undefined ? { option2: input.option2 } : {}),
        ...(input.option3 !== undefined ? { option3: input.option3 } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      };

      const variant = await prisma.productVariant.update({
        where: { id: variantId },
        data,
      });

      response.status(200).json({ variant });
    } catch (error) {
      next(error);
    }
  },
);

productsRouter.delete(
  "/:shopId/products/:productId/variants/:variantId",
  async (request, response, next) => {
    try {
      const authUser = getAuthUser(request);
      const { shopId } = paramsSchema.parse(request.params);
      const productId = z.string().min(1).parse(request.params.productId);
      const variantId = z.string().min(1).parse(request.params.variantId);

      await assertUserOwnsShop(authUser.id, shopId);
      await assertProductBelongsToShop(productId, shopId);

      const existingVariant = await prisma.productVariant.findFirst({
        where: { id: variantId, productId },
        select: { id: true },
      });

      if (!existingVariant) {
        const error = new Error("Product variant not found.");
        error.name = "NotFoundError";
        throw error;
      }

      await prisma.productVariant.delete({ where: { id: variantId } });

      response.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);
