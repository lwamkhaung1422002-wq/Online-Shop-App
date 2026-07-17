import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const paymentsRouter = Router();

const paramsSchema = z.object({
  shopId: z.string().min(1),
});

const moneySchema = z.coerce.number().int().nonnegative();
const positiveMoneySchema = z.coerce.number().int().positive();

const receivePaymentSchema = z.object({
  method: z.string().trim().min(1, "Payment method is required."),
  amount: positiveMoneySchema.optional(),
  billNumber: z.string().trim().optional(),
  transactionId: z.string().trim().optional(),
  note: z.string().trim().optional(),
  paidAt: z.coerce.date().optional(),
});

const codAllocationSchema = z.object({
  orderId: z.string().trim().min(1, "Order is required."),
  amount: positiveMoneySchema,
  phone: z.string().trim().optional(),
});

const receiveCodSettlementSchema = z.object({
  amount: positiveMoneySchema.optional(),
  billNumber: z.string().trim().min(1, "Bill number is required."),
  transactionId: z.string().trim().optional(),
  note: z.string().trim().optional(),
  paidAt: z.coerce.date().optional(),
  allocations: z.array(codAllocationSchema).min(1, "At least one order is required."),
});

const voidCodSettlementSchema = z.object({
  reason: z.string().trim().min(1, "Void reason is required."),
});

const refundPaymentSchema = z.object({
  method: z.string().trim().min(1, "Refund method is required."),
  transactionId: z.string().trim().optional(),
  originalPaymentId: z.string().trim().optional(),
  note: z.string().trim().min(1, "Refund reason is required."),
  paidAt: z.coerce.date().optional(),
  amount: moneySchema.optional(),
});

paymentsRouter.use(requireAuth);

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

function parseJsonArray(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializePayment<T extends { orderIds?: string | null; allocations?: string | null }>(
  payment: T,
) {
  return {
    ...payment,
    orderIds: parseJsonArray(payment.orderIds ?? null),
    allocations: parseJsonArray(payment.allocations ?? null),
  };
}

function paymentScope(type: string, scope?: string | null): string {
  return scope ?? type;
}

async function paidAmountForOrder(tx: any, shopId: string, orderId: string): Promise<number> {
  const directPayments = await tx.payment.findMany({
    where: { shopId, orderId },
    select: { amount: true },
  });

  const scopedPayments = await tx.payment.findMany({
    where: {
      shopId,
      orderIds: { contains: orderId },
    },
    select: { allocations: true, amount: true, type: true, scope: true },
  });

  const directTotal = directPayments.reduce((sum: number, payment: { amount: number }) => {
    return sum + payment.amount;
  }, 0);

  const allocationTotal = scopedPayments.reduce(
    (sum: number, payment: { allocations: string | null; amount: number; type: string; scope: string | null }) => {
      const allocations = parseJsonArray(payment.allocations);
      const sign = payment.amount < 0 || paymentScope(payment.type, payment.scope).includes("void") ? -1 : 1;
      const allocation = allocations.find((entry) => {
        return (
          typeof entry === "object" &&
          entry !== null &&
          "orderId" in entry &&
          entry.orderId === orderId
        );
      });

      if (
        !allocation ||
        typeof allocation !== "object" ||
        !("amount" in allocation) ||
        typeof allocation.amount !== "number"
      ) {
        return sum;
      }

      return sum + sign * allocation.amount;
    },
    0,
  );

  return directTotal + allocationTotal;
}

async function updateOrderPaymentStatus(tx: any, shopId: string, orderId: string) {
  const order = await tx.order.findFirst({
    where: { id: orderId, shopId },
  });

  if (!order) throw notFound("Order not found.");

  const paidAmount = await paidAmountForOrder(tx, shopId, orderId);
  const paymentStatus = paidAmount >= order.total ? "paid" : "unpaid";

  return tx.order.update({
    where: { id: orderId },
    data: { paymentStatus },
    include: {
      customer: true,
      items: { include: { product: true, variant: true, allocations: true } },
      payments: true,
    },
  });
}

async function assertUniquePaymentReference(
  tx: any,
  shopId: string,
  method: string,
  transactionId?: string,
  billNumber?: string,
) {
  if (!transactionId && !billNumber) return;

  const existing = await tx.payment.findFirst({
    where: {
      shopId,
      method,
      ...(transactionId !== undefined ? { transactionId } : {}),
      ...(billNumber !== undefined ? { billNumber } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw badRequest("A payment with this reference already exists.");
  }
}

paymentsRouter.get("/:shopId/payments", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);

    await assertUserOwnsShop(authUser.id, shopId);

    const payments = await prisma.payment.findMany({
      where: { shopId },
      include: { order: true },
      orderBy: { paidAt: "desc" },
    });

    response.status(200).json({ payments: payments.map(serializePayment) });
  } catch (error) {
    next(error);
  }
});

paymentsRouter.post("/:shopId/orders/:orderId/payments", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const orderId = z.string().min(1).parse(request.params.orderId);
    const input = receivePaymentSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, shopId },
      });

      if (!order) throw notFound("Order not found.");
      if (order.fulfillmentStatus === "cancelled") {
        throw badRequest("Cancelled orders cannot receive payment.");
      }
      if (order.paymentStatus === "refunded") {
        throw badRequest("Refunded orders cannot receive another payment yet.");
      }

      await assertUniquePaymentReference(
        tx,
        shopId,
        input.method,
        input.transactionId,
        input.billNumber,
      );

      const paidAmount = await paidAmountForOrder(tx, shopId, order.id);
      const remainingAmount = Math.max(0, order.total - paidAmount);
      const amount = input.amount ?? remainingAmount;

      if (remainingAmount <= 0) {
        throw badRequest("Payment has already been received.");
      }
      if (amount > remainingAmount) {
        throw badRequest("Payment amount cannot exceed the remaining order balance.");
      }

      const payment = await tx.payment.create({
        data: {
          shopId,
          orderId: order.id,
          type: "payment",
          method: input.method,
          amount,
          ...(input.billNumber !== undefined ? { billNumber: input.billNumber } : {}),
          ...(input.transactionId !== undefined ? { transactionId: input.transactionId } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
        },
      });

      const updatedOrder = await updateOrderPaymentStatus(tx, shopId, order.id);

      return { payment: serializePayment(payment), order: updatedOrder };
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

paymentsRouter.post("/:shopId/payments/cod-settlements", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const input = receiveCodSettlementSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);

    const result = await prisma.$transaction(async (tx) => {
      const totalAmount = input.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
      const amount = input.amount ?? totalAmount;

      if (amount !== totalAmount) {
        throw badRequest("Settlement amount must equal allocation total.");
      }

      await assertUniquePaymentReference(tx, shopId, "COD", input.transactionId, input.billNumber);

      const orderIds = input.allocations.map((allocation) => allocation.orderId);
      const uniqueOrderIds = new Set(orderIds);

      if (uniqueOrderIds.size !== orderIds.length) {
        throw badRequest("Each COD settlement order can only appear once.");
      }

      for (const allocation of input.allocations) {
        const order = await tx.order.findFirst({
          where: { id: allocation.orderId, shopId },
          include: { customer: true },
        });

        if (!order) throw notFound("Order not found.");
        if (order.fulfillmentStatus === "cancelled") {
          throw badRequest("Cancelled orders cannot be settled.");
        }
        if (allocation.phone && order.customer?.phone && allocation.phone !== order.customer.phone) {
          throw badRequest("COD settlement phone does not match the order customer.");
        }

        const paidAmount = await paidAmountForOrder(tx, shopId, order.id);
        const remainingAmount = Math.max(0, order.total - paidAmount);

        if (remainingAmount <= 0) {
          throw badRequest("One or more orders are already fully paid.");
        }
        if (allocation.amount > remainingAmount) {
          throw badRequest("COD allocation cannot exceed an order's remaining balance.");
        }
      }

      const payment = await tx.payment.create({
        data: {
          shopId,
          type: "payment",
          scope: "cod-settlement",
          method: "COD",
          amount,
          billNumber: input.billNumber,
          orderIds: JSON.stringify(orderIds),
          allocations: JSON.stringify(input.allocations),
          ...(input.transactionId !== undefined ? { transactionId: input.transactionId } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
        },
      });

      const orders = [];
      for (const orderId of orderIds) {
        orders.push(await updateOrderPaymentStatus(tx, shopId, orderId));
      }

      return { payment: serializePayment(payment), orders };
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

paymentsRouter.post("/:shopId/payments/:paymentId/void", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const paymentId = z.string().min(1).parse(request.params.paymentId);
    const input = voidCodSettlementSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);

    const result = await prisma.$transaction(async (tx) => {
      const original = await tx.payment.findFirst({
        where: { id: paymentId, shopId },
      });

      if (!original) throw notFound("Payment not found.");
      if (paymentScope(original.type, original.scope) !== "cod-settlement") {
        throw badRequest("Only COD settlements can be voided through this endpoint.");
      }

      const existingVoid = await tx.payment.findFirst({
        where: { shopId, originalPaymentId: original.id, scope: "cod-settlement-void" },
        select: { id: true },
      });

      if (existingVoid) {
        throw badRequest("COD settlement has already been voided.");
      }

      const orderIds = parseJsonArray(original.orderIds).filter(
        (entry): entry is string => typeof entry === "string",
      );

      const voidPayment = await tx.payment.create({
        data: {
          shopId,
          type: "cod-settlement-void",
          scope: "cod-settlement-void",
          method: original.method,
          amount: -Math.abs(original.amount),
          billNumber: original.billNumber,
          transactionId: original.transactionId,
          originalPaymentId: original.id,
          reason: input.reason,
          note: input.reason,
          orderIds: original.orderIds,
          allocations: original.allocations,
        },
      });

      const orders = [];
      for (const orderId of orderIds) {
        orders.push(await updateOrderPaymentStatus(tx, shopId, orderId));
      }

      return { payment: serializePayment(voidPayment), orders };
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

paymentsRouter.post("/:shopId/orders/:orderId/refunds", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const orderId = z.string().min(1).parse(request.params.orderId);
    const input = refundPaymentSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, shopId },
      });

      if (!order) throw notFound("Order not found.");
      if (order.paymentStatus !== "paid") {
        throw badRequest("Only paid orders can be refunded.");
      }

      if (input.originalPaymentId) {
        const originalPayment = await tx.payment.findFirst({
          where: { id: input.originalPaymentId, shopId },
        });

        if (!originalPayment) throw notFound("Original payment not found.");
        if (originalPayment.method === "COD") {
          throw badRequest("Void COD settlements instead of refunding them.");
        }
      }

      const paidAmount = await paidAmountForOrder(tx, shopId, order.id);
      const refundAmount = input.amount ?? paidAmount;

      if (refundAmount <= 0 || refundAmount > paidAmount) {
        throw badRequest("Refund amount must be within the paid order balance.");
      }

      const refund = await tx.payment.create({
        data: {
          shopId,
          orderId: order.id,
          type: "refund",
          method: input.method,
          amount: -Math.abs(refundAmount),
          reason: input.note,
          note: input.note,
          ...(input.originalPaymentId !== undefined ? { originalPaymentId: input.originalPaymentId } : {}),
          ...(input.transactionId !== undefined ? { transactionId: input.transactionId } : {}),
          ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
        },
      });

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: refundAmount >= paidAmount ? "refunded" : "unpaid",
          refundId: refund.id,
        },
        include: {
          customer: true,
          items: { include: { product: true, variant: true, allocations: true } },
          payments: true,
        },
      });

      return { refund: serializePayment(refund), order: updatedOrder };
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});
