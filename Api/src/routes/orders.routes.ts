import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const ordersRouter = Router();

const paramsSchema = z.object({
  shopId: z.string().min(1),
});

const moneySchema = z.coerce.number().int().nonnegative();

const orderItemSchema = z.object({
  productId: z.string().trim().min(1, "Product is required."),
  variantId: z.string().trim().optional(),
  quantity: z.coerce.number().int().positive("Quantity must be greater than 0."),
  unitPrice: moneySchema.optional(),
  discount: moneySchema.optional(),
  deductionType: z.enum(["discount", "advance-payment"]).default("discount"),
});

const embeddedCustomerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required."),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

const createOrderSchema = z.object({
  customerId: z.string().trim().optional(),
  customer: embeddedCustomerSchema.optional(),
  orderNumber: z.string().trim().optional(),
  fulfillmentStatus: z.enum(["reserved", "preorder"]).default("reserved"),
  discount: moneySchema.optional(),
  deliveryFee: moneySchema.optional(),
  source: z.string().trim().optional(),
  note: z.string().trim().optional(),
  items: z.array(orderItemSchema).min(1, "At least one order item is required."),
});

const updateStatusSchema = z.object({
  fulfillmentStatus: z.enum(["reserved", "completed"]),
});

const cancelOrderSchema = z.object({
  reason: z.string().trim().optional(),
});

ordersRouter.use(requireAuth);

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

function lineTotal(quantity: number, unitPrice: number, discount = 0): number {
  return Math.max(0, quantity * unitPrice - discount);
}

async function reserveOrderInventory(
  tx: any,
  shopId: string,
  orderId: string,
) {
  const order = await tx.order.findFirst({
    where: { id: orderId, shopId },
    include: {
      items: { include: { allocations: true, product: true, variant: true } },
    },
  });

  if (!order) throw notFound("Order not found.");
  if (order.fulfillmentStatus === "cancelled") {
    throw badRequest("Cancelled orders cannot be fulfilled.");
  }
  if (order.fulfillmentStatus !== "preorder") {
    throw badRequest("Only preorders can be fulfilled through this endpoint.");
  }

  for (const item of order.items) {
    if (item.allocations.length > 0) {
      throw badRequest("Order already has reserved inventory allocations.");
    }

    const batches = await tx.inventoryBatch.findMany({
      where: {
        shopId,
        productId: item.productId,
        variantId: item.variantId ?? null,
      },
      orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
    });

    let remaining = item.quantity;
    const allocations: Array<{ inventoryBatchId: string; quantity: number; unitCost: number }> = [];

    for (const batch of batches) {
      if (remaining <= 0) break;

      const available = batch.quantity - batch.reservedQuantity;
      const take = Math.min(available, remaining);

      if (take <= 0) continue;

      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: { reservedQuantity: batch.reservedQuantity + take },
      });

      allocations.push({
        inventoryBatchId: batch.id,
        quantity: take,
        unitCost: batch.unitCost,
      });

      remaining -= take;
    }

    if (remaining > 0) {
      throw badRequest(
        `${item.productName}${item.variantName ? ` / ${item.variantName}` : ""} is short by ${remaining}.`,
      );
    }

    const totalCost = allocations.reduce(
      (sum, allocation) => sum + allocation.quantity * allocation.unitCost,
      0,
    );

    await tx.orderItem.update({
      where: { id: item.id },
      data: {
        unitCost: item.quantity > 0 ? Math.round(totalCost / item.quantity) : item.unitCost,
        allocations: { create: allocations },
      },
    });
  }

  return tx.order.update({
    where: { id: orderId },
    data: { fulfillmentStatus: "reserved", completedAt: null },
    include: {
      customer: true,
      items: {
        include: {
          product: true,
          variant: true,
          allocations: { include: { inventoryBatch: true } },
        },
      },
      payments: true,
    },
  });
}

ordersRouter.get("/:shopId/orders", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);

    await assertUserOwnsShop(authUser.id, shopId);

    const orders = await prisma.order.findMany({
      where: { shopId },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
            variant: true,
            allocations: {
              include: { inventoryBatch: true },
            },
          },
        },
        payments: true,
      },
      orderBy: { createdAt: "desc" },
    });

    response.status(200).json({ orders });
  } catch (error) {
    next(error);
  }
});

ordersRouter.get("/:shopId/orders/:orderId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const orderId = z.string().min(1).parse(request.params.orderId);

    await assertUserOwnsShop(authUser.id, shopId);

    const order = await prisma.order.findFirst({
      where: { id: orderId, shopId },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
            variant: true,
            allocations: {
              include: { inventoryBatch: true },
            },
          },
        },
        payments: true,
      },
    });

    if (!order) throw notFound("Order not found.");

    response.status(200).json({ order });
  } catch (error) {
    next(error);
  }
});

ordersRouter.post("/:shopId/orders", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const input = createOrderSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);

    if (input.customerId && input.customer) {
      throw badRequest("Use either customerId or customer, not both.");
    }

    if (input.customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: input.customerId, shopId },
        select: { id: true },
      });
      if (!customer) throw notFound("Customer not found.");
    }

    const order = await prisma.$transaction(async (tx) => {
      const preparedItems = [];
      let customerId = input.customerId;

      if (input.customer) {
        const customer = await tx.customer.create({
          data: {
            shopId,
            name: input.customer.name,
            ...(input.customer.phone !== undefined ? { phone: input.customer.phone } : {}),
            ...(input.customer.email !== undefined ? { email: input.customer.email } : {}),
            ...(input.customer.address !== undefined ? { address: input.customer.address } : {}),
            ...(input.customer.city !== undefined ? { city: input.customer.city } : {}),
            ...(input.customer.notes !== undefined ? { notes: input.customer.notes } : {}),
          },
        });

        customerId = customer.id;
      }

      for (const item of input.items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, shopId },
          include: { variants: true },
        });

        if (!product) throw notFound("Product not found.");

        const variant = item.variantId
          ? product.variants.find((entry) => entry.id === item.variantId)
          : null;

        if (item.variantId && !variant) {
          throw notFound("Product variant not found.");
        }

        if (variant && (!variant.isActive || variant.archivedAt)) {
          throw badRequest("Product variant is archived and cannot be sold.");
        }

        const unitPrice = item.unitPrice ?? variant?.price ?? product.price;
        const discount = item.discount ?? 0;

        preparedItems.push({
          input: item,
          product,
          variant,
          quantity: item.quantity,
          unitPrice,
          discount,
          deductionType: item.deductionType,
          lineTotal: lineTotal(item.quantity, unitPrice, discount),
        });
      }

      const subtotal = preparedItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const orderDiscount = Math.min(input.discount ?? 0, subtotal);
      const deliveryFee = input.deliveryFee ?? 0;
      const total = Math.max(0, subtotal - orderDiscount + deliveryFee);

      const createdOrder = await tx.order.create({
        data: {
          shopId,
          subtotal,
          discount: orderDiscount,
          deliveryFee,
          total,
          fulfillmentStatus: input.fulfillmentStatus,
          paymentStatus: "unpaid",
          ...(customerId !== undefined ? { customerId } : {}),
          ...(input.orderNumber !== undefined ? { orderNumber: input.orderNumber } : {}),
          ...(input.source !== undefined ? { source: input.source } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
      });

      for (const prepared of preparedItems) {
        const batches =
          input.fulfillmentStatus === "reserved"
            ? await tx.inventoryBatch.findMany({
                where: {
                  shopId,
                  productId: prepared.product.id,
                  variantId: prepared.variant?.id ?? null,
                },
                orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
              })
            : [];

        let remaining = prepared.quantity;
        const allocations: Array<{ inventoryBatchId: string; quantity: number; unitCost: number }> =
          [];

        for (const batch of batches) {
          if (remaining <= 0) break;

          const available = batch.quantity - batch.reservedQuantity;
          const take = Math.min(available, remaining);

          if (take <= 0) continue;

          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: { reservedQuantity: batch.reservedQuantity + take },
          });

          allocations.push({
            inventoryBatchId: batch.id,
            quantity: take,
            unitCost: batch.unitCost,
          });

          remaining -= take;
        }

        if (input.fulfillmentStatus === "reserved" && remaining > 0) {
          throw badRequest(
            `${prepared.product.name}${prepared.variant ? ` / ${prepared.variant.name}` : ""} is short by ${remaining}.`,
          );
        }

        const totalCost = allocations.reduce(
          (sum, allocation) => sum + allocation.quantity * allocation.unitCost,
          0,
        );
        const fallbackCost = prepared.variant?.cost ?? prepared.product.cost ?? 0;
        const unitCost =
          prepared.quantity > 0 && allocations.length > 0
            ? Math.round(totalCost / prepared.quantity)
            : fallbackCost;

        await tx.orderItem.create({
          data: {
            orderId: createdOrder.id,
            productId: prepared.product.id,
            productName: prepared.product.name,
            quantity: prepared.quantity,
            unitPrice: prepared.unitPrice,
            unitCost,
            discount: prepared.discount,
            deductionType: prepared.deductionType,
            lineTotal: prepared.lineTotal,
            ...(prepared.variant ? { variantId: prepared.variant.id, variantName: prepared.variant.name } : {}),
            allocations: {
              create: allocations,
            },
          },
        });
      }

      const fullOrder = await tx.order.findUniqueOrThrow({
        where: { id: createdOrder.id },
        include: {
          customer: true,
          items: {
            include: {
              product: true,
              variant: true,
              allocations: {
                include: { inventoryBatch: true },
              },
            },
          },
          payments: true,
        },
      });

      return fullOrder;
    });

    response.status(201).json({ order });
  } catch (error) {
    next(error);
  }
});

ordersRouter.post("/:shopId/orders/:orderId/fulfill", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const orderId = z.string().min(1).parse(request.params.orderId);

    await assertUserOwnsShop(authUser.id, shopId);

    const order = await prisma.$transaction((tx) => reserveOrderInventory(tx, shopId, orderId));

    response.status(200).json({ order });
  } catch (error) {
    next(error);
  }
});

ordersRouter.patch("/:shopId/orders/:orderId/status", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const orderId = z.string().min(1).parse(request.params.orderId);
    const input = updateStatusSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);

    const existingOrder = await prisma.order.findFirst({
      where: { id: orderId, shopId },
      select: { id: true, fulfillmentStatus: true },
    });

    if (!existingOrder) throw notFound("Order not found.");
    if (existingOrder.fulfillmentStatus === "cancelled") {
      throw badRequest("Cancelled orders cannot be updated.");
    }
    if (existingOrder.fulfillmentStatus === "preorder") {
      throw badRequest("Preorders cannot be completed until converted in a future preorder flow.");
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        fulfillmentStatus: input.fulfillmentStatus,
        completedAt: input.fulfillmentStatus === "completed" ? new Date() : null,
      },
      include: {
        customer: true,
        items: { include: { product: true, variant: true, allocations: true } },
        payments: true,
      },
    });

    response.status(200).json({ order });
  } catch (error) {
    next(error);
  }
});

ordersRouter.post("/:shopId/orders/:orderId/cancel", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const orderId = z.string().min(1).parse(request.params.orderId);
    const input = cancelOrderSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);

    const order = await prisma.$transaction(async (tx) => {
      const existingOrder = await tx.order.findFirst({
        where: { id: orderId, shopId },
        include: {
          items: { include: { allocations: true } },
        },
      });

      if (!existingOrder) throw notFound("Order not found.");
      if (existingOrder.fulfillmentStatus === "cancelled") {
        throw badRequest("Order is already cancelled.");
      }
      if (existingOrder.paymentStatus === "paid") {
        throw badRequest("Refund the payment before cancelling this order.");
      }

      for (const item of existingOrder.items) {
        for (const allocation of item.allocations) {
          const batch = await tx.inventoryBatch.findUnique({
            where: { id: allocation.inventoryBatchId },
          });

          if (!batch) continue;

          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: {
              reservedQuantity: Math.max(0, batch.reservedQuantity - allocation.quantity),
            },
          });
        }
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          fulfillmentStatus: "cancelled",
          cancelledAt: new Date(),
          note: input.reason ?? existingOrder.note,
        },
        include: {
          customer: true,
          items: { include: { product: true, variant: true, allocations: true } },
          payments: true,
        },
      });
    });

    response.status(200).json({ order });
  } catch (error) {
    next(error);
  }
});
