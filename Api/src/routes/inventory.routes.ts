import { Router } from "express";
import { z } from "zod";

import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const inventoryRouter = Router();

const paramsSchema = z.object({
  shopId: z.string().min(1),
});

const moneySchema = z.coerce.number().int().nonnegative();

const createInventoryBatchSchema = z.object({
  productId: z.string().trim().min(1, "Product is required."),
  variantId: z.string().trim().optional(),
  quantity: z.coerce.number().int().positive("Quantity must be greater than 0."),
  unitCost: moneySchema,
  receivedAt: z.coerce.date().optional(),
  note: z.string().trim().optional(),
});

const updateInventoryBatchSchema = z.object({
  unitCost: moneySchema.optional(),
  receivedAt: z.coerce.date().optional(),
  note: z.string().trim().optional(),
});

const adjustmentSchema = z.object({
  action: z.enum(["ADD", "REMOVE", "SUB", "SET"]),
  quantity: z.coerce.number().int().nonnegative(),
  reason: z.string().trim().min(1, "Reason is required."),
});

inventoryRouter.use(requireAuth);

function notFound(message: string): Error {
  const error = new Error(message);
  error.name = "NotFoundError";
  return error;
}

function badRequest(message: string): Error {
  const error = new Error(message);
  error.name = "BadRequestError";
  return error;
}

async function assertProductBelongsToShop(productId: string, shopId: string): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { id: productId, shopId },
    select: { id: true },
  });

  if (!product) {
    throw notFound("Product not found.");
  }
}

async function assertVariantBelongsToProduct(
  variantId: string | undefined,
  productId: string,
): Promise<void> {
  if (!variantId) return;

  const variant = await prisma.productVariant.findFirst({
    where: {
      id: variantId,
      productId,
    },
    select: { id: true, isActive: true, archivedAt: true },
  });

  if (!variant) {
    throw notFound("Product variant not found.");
  }

  if (!variant.isActive || variant.archivedAt) {
    throw badRequest("Product variant is archived and cannot receive new stock.");
  }
}

inventoryRouter.get("/:shopId/inventory", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);

    await assertUserOwnsShop(authUser.id, shopId);

    const inventory = await prisma.inventoryBatch.findMany({
      where: { shopId },
      include: {
        product: true,
        variant: true,
      },
      orderBy: { receivedAt: "desc" },
    });

    response.status(200).json({ inventory });
  } catch (error) {
    next(error);
  }
});

inventoryRouter.post("/:shopId/inventory", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const input = createInventoryBatchSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);
    await assertProductBelongsToShop(input.productId, shopId);
    await assertVariantBelongsToProduct(input.variantId, input.productId);

    const data: Prisma.InventoryBatchUncheckedCreateInput = {
      shopId,
      productId: input.productId,
      quantity: input.quantity,
      unitCost: input.unitCost,
      ...(input.variantId !== undefined ? { variantId: input.variantId } : {}),
      ...(input.receivedAt !== undefined ? { receivedAt: input.receivedAt } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    };

    const inventoryBatch = await prisma.inventoryBatch.create({
      data,
      include: {
        product: true,
        variant: true,
      },
    });

    response.status(201).json({ inventoryBatch });
  } catch (error) {
    next(error);
  }
});

inventoryRouter.patch("/:shopId/inventory/:inventoryBatchId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const inventoryBatchId = z.string().min(1).parse(request.params.inventoryBatchId);
    const input = updateInventoryBatchSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);

    const existingBatch = await prisma.inventoryBatch.findFirst({
      where: { id: inventoryBatchId, shopId },
      select: { id: true },
    });

    if (!existingBatch) {
      throw notFound("Inventory batch not found.");
    }

    const data: Prisma.InventoryBatchUncheckedUpdateInput = {
      ...(input.unitCost !== undefined ? { unitCost: input.unitCost } : {}),
      ...(input.receivedAt !== undefined ? { receivedAt: input.receivedAt } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    };

    const inventoryBatch = await prisma.inventoryBatch.update({
      where: { id: inventoryBatchId },
      data,
      include: {
        product: true,
        variant: true,
      },
    });

    response.status(200).json({ inventoryBatch });
  } catch (error) {
    next(error);
  }
});

inventoryRouter.delete("/:shopId/inventory/:inventoryBatchId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const inventoryBatchId = z.string().min(1).parse(request.params.inventoryBatchId);

    await assertUserOwnsShop(authUser.id, shopId);

    const existingBatch = await prisma.inventoryBatch.findFirst({
      where: { id: inventoryBatchId, shopId },
      select: { id: true, reservedQuantity: true },
    });

    if (!existingBatch) {
      throw notFound("Inventory batch not found.");
    }

    if (existingBatch.reservedQuantity > 0) {
      throw badRequest("Inventory batch has reserved stock and cannot be deleted.");
    }

    await prisma.inventoryBatch.delete({
      where: { id: inventoryBatchId },
    });

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

inventoryRouter.post(
  "/:shopId/inventory/:inventoryBatchId/adjustments",
  async (request, response, next) => {
    try {
      const authUser = getAuthUser(request);
      const { shopId } = paramsSchema.parse(request.params);
      const inventoryBatchId = z.string().min(1).parse(request.params.inventoryBatchId);
      const input = adjustmentSchema.parse(request.body);

      if (input.action !== "SET" && input.quantity < 1) {
        throw badRequest("Quantity must be greater than 0.");
      }

      await assertUserOwnsShop(authUser.id, shopId);

      const result = await prisma.$transaction(async (tx) => {
        const batch = await tx.inventoryBatch.findFirst({
          where: { id: inventoryBatchId, shopId },
        });

        if (!batch) {
          throw notFound("Inventory batch not found.");
        }

        const beforeQuantity = batch.quantity;
        const action = input.action === "REMOVE" ? "SUB" : input.action;
        const afterQuantity =
          action === "ADD"
            ? beforeQuantity + input.quantity
            : action === "SUB"
              ? beforeQuantity - input.quantity
              : input.quantity;

        if (afterQuantity < 0) {
          throw badRequest("Inventory quantity cannot be negative.");
        }

        if (afterQuantity < batch.reservedQuantity) {
          throw badRequest(
            `Inventory quantity cannot be lower than reserved quantity (${batch.reservedQuantity}).`,
          );
        }

        const inventoryBatch = await tx.inventoryBatch.update({
          where: { id: inventoryBatchId },
          data: { quantity: afterQuantity },
          include: {
            product: true,
            variant: true,
          },
        });

        const adjustment = await tx.stockAdjustment.create({
          data: {
            shopId,
            inventoryBatchId,
            action,
            quantity: input.quantity,
            beforeQuantity,
            afterQuantity,
            reason: input.reason,
          },
        });

        return { inventoryBatch, adjustment };
      });

      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

inventoryRouter.get("/:shopId/inventory-adjustments", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);

    await assertUserOwnsShop(authUser.id, shopId);

    const adjustments = await prisma.stockAdjustment.findMany({
      where: { shopId },
      include: {
        inventoryBatch: {
          include: {
            product: true,
            variant: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    response.status(200).json({ adjustments });
  } catch (error) {
    next(error);
  }
});
