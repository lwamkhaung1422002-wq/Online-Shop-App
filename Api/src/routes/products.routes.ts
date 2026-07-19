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
const maxOptionLevels = 3;

const optionValueSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(80),
  level: z.coerce.number().int().min(0).max(maxOptionLevels - 1),
  parentId: z.string().trim().min(1).max(80).nullable().optional(),
});

const optionLevelSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(40),
});

const optionTreeSchema = z.object({
  levels: z.array(optionLevelSchema).max(maxOptionLevels).default([]),
  values: z.array(optionValueSchema).max(500).default([]),
});

const optionPathSchema = z
  .array(
    z.object({
      level: z.coerce.number().int().min(0).max(maxOptionLevels - 1),
      label: z.string().trim().min(1).max(40),
      valueId: z.string().trim().min(1).max(80),
      value: z.string().trim().min(1).max(80),
    }),
  )
  .max(maxOptionLevels);

const productSchema = z.object({
  name: z.string().trim().min(1, "Product name is required."),
  description: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  price: moneySchema,
  cost: moneySchema.optional(),
  categoryId: z.string().trim().optional(),
  optionTree: optionTreeSchema.optional(),
  isActive: z.boolean().optional(),
});

const updateProductSchema = productSchema.partial();

const variantSchema = z.object({
  name: z.string().trim().min(1, "Variant name is required.").optional(),
  sku: z.string().trim().optional(),
  price: moneySchema.optional(),
  cost: moneySchema.optional(),
  option1: z.string().trim().optional(),
  option2: z.string().trim().optional(),
  option3: z.string().trim().optional(),
  optionPath: optionPathSchema.optional(),
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

function badRequest(message: string): Error {
  const error = new Error(message);
  error.name = "BadRequestError";
  return error;
}

function normalizeOptionTree(input: z.infer<typeof optionTreeSchema>) {
  const levels = input.levels.map((level, index) => ({
    id: level.id.trim(),
    label: level.label.trim(),
    level: index,
  }));
  const levelIds = new Set(levels.map((level) => level.id));
  const valueIds = new Set<string>();
  const values = input.values.map((value) => {
    const normalized = {
      id: value.id.trim(),
      label: value.label.trim(),
      level: value.level,
      parentId: null,
    };

    if (valueIds.has(normalized.id)) {
      throw badRequest("Option values must be unique.");
    }
    valueIds.add(normalized.id);

    const level = levels[normalized.level];
    if (!level || !levelIds.has(level.id)) {
      throw badRequest("Option value level is invalid.");
    }
    return normalized;
  });

  const siblingNames = new Set<string>();
  values.forEach((value) => {
    const siblingKey = `${value.level}:${value.label.toLowerCase()}`;
    if (siblingNames.has(siblingKey)) {
      throw badRequest("Option values inside the same option group must be unique.");
    }
    siblingNames.add(siblingKey);
  });

  if (values.length > 0 && levels.length === 0) {
    throw badRequest("Option labels are required when option values exist.");
  }

  return { levels, values };
}

function parseStoredOptionTree(optionTree: unknown) {
  return normalizeOptionTree(optionTreeSchema.parse(optionTree ?? {}));
}

function variantSignature(optionPath: z.infer<typeof optionPathSchema> | undefined) {
  if (!optionPath || optionPath.length === 0) return "__default";
  return optionPath
    .slice()
    .sort((a, b) => a.level - b.level)
    .map((entry) => `${entry.level}:${entry.valueId}`)
    .join("|");
}

function validateVariantPath(optionTree: unknown, optionPath: z.infer<typeof optionPathSchema> | undefined) {
  const tree = parseStoredOptionTree(optionTree);
  const path = optionPath ?? [];

  if (tree.levels.length === 0) {
    if (path.length > 0) throw badRequest("This product does not use options.");
    return [];
  }

  if (path.length !== tree.levels.length) {
    throw badRequest("Variant option path does not match this product's option levels.");
  }

  const valuesById = new Map(tree.values.map((value) => [value.id, value]));
  const sortedPath = path.slice().sort((a, b) => a.level - b.level);
  const normalized = sortedPath.map((entry, index) => {
      const level = tree.levels[index];
      const value = valuesById.get(entry.valueId);

      if (!level || entry.level !== index || !value || value.level !== index) {
        throw badRequest("Variant option path contains an invalid option value.");
      }

      return {
        level: index,
        label: level.label,
        valueId: value.id,
        value: value.label,
      };
    });

  return normalized;
}

function variantNameFromPath(path: z.infer<typeof optionPathSchema>) {
  return path.length ? path.map((entry) => entry.value).join(" / ") : "Default";
}

function relabelVariantPath(optionTree: unknown, storedPath: unknown) {
  const tree = parseStoredOptionTree(optionTree);
  const path = optionPathSchema.parse(storedPath ?? []);
  if (path.length === 0) return [];

  const valuesById = new Map(tree.values.map((value) => [value.id, value]));
  return path.map((entry) => {
    const level = tree.levels[entry.level];
    const value = valuesById.get(entry.valueId);
    return {
      ...entry,
      label: level?.label ?? entry.label,
      value: value?.label ?? entry.value,
    };
  });
}

productsRouter.get("/:shopId/products", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);

    await assertUserOwnsShop(authUser.id, shopId);

    const products = await prisma.product.findMany({
      where: { shopId, isActive: true },
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
      ...(input.optionTree !== undefined ? { optionTree: normalizeOptionTree(input.optionTree) } : {}),
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
      ...(input.optionTree !== undefined ? { optionTree: normalizeOptionTree(input.optionTree) } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    };

    const product = await prisma.$transaction(async (tx) => {
      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data,
        include: {
          category: true,
          variants: true,
        },
      });

      if (input.optionTree !== undefined) {
        for (const variant of updatedProduct.variants) {
          const nextPath = relabelVariantPath(updatedProduct.optionTree, variant.optionPath);
          if (nextPath.length === 0) continue;
          await tx.productVariant.update({
            where: { id: variant.id },
            data: {
              optionPath: nextPath,
              option1: nextPath[0]?.value ?? null,
              option2: nextPath[1]?.value ?? null,
              option3: nextPath[2]?.value ?? null,
              name: variantNameFromPath(nextPath),
            },
          });
        }
      }

      return tx.product.findUniqueOrThrow({
        where: { id: productId },
        include: {
          category: true,
          variants: true,
        },
      });
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
    const product = await prisma.product.findFirst({
      where: { id: productId, shopId },
      include: {
        inventory: true,
        variants: true,
      },
    });

    if (!product) {
      const error = new Error("Product not found.");
      error.name = "NotFoundError";
      throw error;
    }

    const availableQuantity = product.inventory.reduce(
      (sum, batch) => sum + Math.max(0, batch.quantity - batch.reservedQuantity),
      0,
    );

    if (availableQuantity > 0) {
      throw badRequest("Product cannot be removed while stock is still available.");
    }

    const removedProduct = await prisma.$transaction(async (tx) => {
      await tx.productVariant.updateMany({
        where: { productId },
        data: { isActive: false, archivedAt: new Date() },
      });

      return tx.product.update({
        where: { id: productId },
        data: { isActive: false },
        include: {
          category: true,
          variants: true,
        },
      });
    });

    response.status(200).json({ product: removedProduct, removed: true });
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
    const product = await prisma.product.findFirst({
      where: { id: productId, shopId },
      select: { id: true, optionTree: true },
    });

    if (!product) {
      const error = new Error("Product not found.");
      error.name = "NotFoundError";
      throw error;
    }

    const optionPath = validateVariantPath(product.optionTree, input.optionPath);
    const signature = variantSignature(optionPath);

    const duplicateVariant = await prisma.productVariant.findFirst({
      where: { productId, variantSignature: signature },
      select: { id: true, isActive: true },
    });

    if (duplicateVariant) {
      throw badRequest(
        duplicateVariant.isActive
          ? "This variant already exists."
          : "This variant is archived. Edit or reactivate it instead of creating a duplicate.",
      );
    }

    const data: Prisma.ProductVariantUncheckedCreateInput = {
      name: input.name || variantNameFromPath(optionPath),
      productId,
      optionPath,
      variantSignature: signature,
    };
    if (input.sku !== undefined) data.sku = input.sku;
    if (input.price !== undefined) data.price = input.price;
    if (input.cost !== undefined) data.cost = input.cost;
    if (input.option3 !== undefined) data.option3 = input.option3;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    data.option1 = input.option1 ?? optionPath[0]?.value ?? null;
    data.option2 = input.option2 ?? optionPath[1]?.value ?? null;
    data.option3 = input.option3 ?? optionPath[2]?.value ?? null;

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
      const product = await prisma.product.findFirst({
        where: { id: productId, shopId },
        select: { id: true, optionTree: true },
      });

      if (!product) {
        const error = new Error("Product not found.");
        error.name = "NotFoundError";
        throw error;
      }

      const existingVariant = await prisma.productVariant.findFirst({
        where: { id: variantId, productId },
        select: { id: true },
      });

      if (!existingVariant) {
        const error = new Error("Product variant not found.");
        error.name = "NotFoundError";
        throw error;
      }

      const optionPath =
        input.optionPath !== undefined ? validateVariantPath(product.optionTree, input.optionPath) : undefined;

      if (optionPath !== undefined) {
        const duplicateVariant = await prisma.productVariant.findFirst({
          where: {
            productId,
            variantSignature: variantSignature(optionPath),
            id: { not: variantId },
          },
          select: { id: true },
        });

        if (duplicateVariant) {
          throw badRequest("This variant already exists.");
        }
      }

      const data: Prisma.ProductVariantUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.sku !== undefined) data.sku = input.sku;
      if (input.price !== undefined) data.price = input.price;
      if (input.cost !== undefined) data.cost = input.cost;
      if (input.option3 !== undefined) data.option3 = input.option3;
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.option1 !== undefined) data.option1 = input.option1;
      if (input.option2 !== undefined) data.option2 = input.option2;
      if (optionPath !== undefined) {
        data.option1 = optionPath[0]?.value ?? null;
        data.option2 = optionPath[1]?.value ?? null;
        data.option3 = optionPath[2]?.value ?? null;
        data.optionPath = optionPath;
        data.variantSignature = variantSignature(optionPath);
      }

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

      const usage = await prisma.productVariant.findUnique({
        where: { id: variantId },
        select: {
          _count: {
            select: {
              inventory: true,
              orderItems: true,
            },
          },
        },
      });

      if ((usage?._count.inventory ?? 0) > 0 || (usage?._count.orderItems ?? 0) > 0) {
        const variant = await prisma.productVariant.update({
          where: { id: variantId },
          data: { isActive: false, archivedAt: new Date() },
        });
        response.status(200).json({ variant, archived: true });
        return;
      }

      await prisma.productVariant.delete({ where: { id: variantId } });

      response.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);
