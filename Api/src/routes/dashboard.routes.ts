import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const dashboardRouter = Router();

const paramsSchema = z.object({
  shopId: z.string().min(1),
});

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

dashboardRouter.use(requireAuth);

function dateRange(input: z.infer<typeof querySchema>) {
  if (!input.from && !input.to) return undefined;

  return {
    ...(input.from ? { gte: input.from } : {}),
    ...(input.to ? { lte: input.to } : {}),
  };
}

function isRecognizedSale(order: {
  paymentStatus: string;
  fulfillmentStatus: string;
}): boolean {
  return (
    order.paymentStatus === "paid" &&
    order.fulfillmentStatus !== "cancelled" &&
    order.fulfillmentStatus !== "preorder"
  );
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

function paidAmountForOrder(orderId: string, payments: Array<{
  orderId: string | null;
  orderIds: string | null;
  allocations: string | null;
  amount: number;
  type: string;
  scope: string | null;
}>): number {
  return payments.reduce((sum, payment) => {
    if (payment.type === "refund" || payment.scope === "cod-settlement-void") {
      return sum;
    }

    if (payment.orderId === orderId) {
      return sum + payment.amount;
    }

    const orderIds = parseJsonArray(payment.orderIds).filter((entry): entry is string => typeof entry === "string");
    if (!orderIds.includes(orderId)) return sum;

    const allocations = parseJsonArray(payment.allocations);
    const allocation = allocations.find((entry) => {
      return typeof entry === "object" && entry !== null && "orderId" in entry && entry.orderId === orderId;
    });

    if (
      typeof allocation === "object" &&
      allocation !== null &&
      "amount" in allocation &&
      typeof allocation.amount === "number"
    ) {
      return sum + allocation.amount;
    }

    return sum;
  }, 0);
}

dashboardRouter.get("/:shopId/dashboard", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const query = querySchema.parse(request.query);

    await assertUserOwnsShop(authUser.id, shopId);

    const orderCreatedAt = dateRange(query);
    const expenseSpentAt = dateRange(query);

    const [orders, payments, expenses, customersCount, productsCount, lowStockBatches] = await Promise.all([
      prisma.order.findMany({
        where: {
          shopId,
          ...(orderCreatedAt ? { createdAt: orderCreatedAt } : {}),
        },
        include: {
          items: true,
        },
      }),
      prisma.payment.findMany({ where: { shopId } }),
      prisma.expense.findMany({
        where: {
          shopId,
          ...(expenseSpentAt ? { spentAt: expenseSpentAt } : {}),
        },
      }),
      prisma.customer.count({ where: { shopId } }),
      prisma.product.count({ where: { shopId, isActive: true } }),
      prisma.inventoryBatch.findMany({
        where: { shopId },
        include: {
          product: true,
          variant: true,
        },
      }),
    ]);

    const recognizedOrders = orders.filter(isRecognizedSale);
    const revenue = recognizedOrders.reduce((sum, order) => sum + order.total, 0);
    const costOfGoods = recognizedOrders.reduce(
      (sum, order) =>
        sum +
        order.items.reduce(
          (itemSum, item) => itemSum + item.unitCost * item.quantity,
          0,
        ),
      0,
    );
    const grossProfit = revenue - costOfGoods;
    const operatingExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const netProfit = grossProfit - operatingExpenses;
    const unpaidTotal = orders
      .filter((order) => order.paymentStatus === "unpaid" && order.fulfillmentStatus !== "cancelled")
      .reduce((sum, order) => sum + Math.max(0, order.total - paidAmountForOrder(order.id, payments)), 0);

    const lowStock = lowStockBatches
      .map((batch) => ({
        inventoryBatchId: batch.id,
        productId: batch.productId,
        productName: batch.product.name,
        variantId: batch.variantId,
        variantName: batch.variant?.name ?? null,
        availableQuantity: batch.quantity - batch.reservedQuantity,
      }))
      .filter((batch) => batch.availableQuantity <= 5)
      .sort((a, b) => a.availableQuantity - b.availableQuantity);

    response.status(200).json({
      summary: {
        revenue,
        costOfGoods,
        grossProfit,
        operatingExpenses,
        netProfit,
        unpaidTotal,
        salesCount: recognizedOrders.length,
        ordersCount: orders.length,
        customersCount,
        activeProductsCount: productsCount,
      },
      lowStock,
    });
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get("/:shopId/reports/sales", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const query = querySchema.parse(request.query);

    await assertUserOwnsShop(authUser.id, shopId);

    const orderCreatedAt = dateRange(query);

    const orders = await prisma.order.findMany({
      where: {
        shopId,
        ...(orderCreatedAt ? { createdAt: orderCreatedAt } : {}),
      },
      include: {
        customer: true,
        items: true,
        payments: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = orders.map((order) => {
      const costOfGoods = order.items.reduce(
        (sum, item) => sum + item.unitCost * item.quantity,
        0,
      );
      const revenue = isRecognizedSale(order) ? order.total : 0;

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customer?.name ?? null,
        fulfillmentStatus: order.fulfillmentStatus,
        paymentStatus: order.paymentStatus,
        subtotal: order.subtotal,
        discount: order.discount,
        deliveryFee: order.deliveryFee,
        total: order.total,
        revenue,
        costOfGoods,
        grossProfit: revenue - costOfGoods,
        createdAt: order.createdAt,
      };
    });

    response.status(200).json({ rows });
  } catch (error) {
    next(error);
  }
});
