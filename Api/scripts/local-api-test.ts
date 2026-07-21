import "dotenv/config";

import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { app } from "../src/app.js";
import { assertLocalDatabaseUrl } from "../src/lib/local-db-guard.js";
import { prisma } from "../src/lib/prisma.js";

type Json = Record<string, any>;

async function request(baseUrl: string, path: string, options: {
  method?: string;
  token?: string;
  body?: Json;
} = {}): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed ${response.status}: ${text}`);
  }
  return data;
}

async function main(): Promise<void> {
  assertLocalDatabaseUrl();

  const server = app.listen(0);
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const stamp = Date.now();

  try {
    const registered = await request(baseUrl, "/auth/register", {
      method: "POST",
      body: {
        name: "API Test Owner",
        shopName: `API Test Shop ${stamp}`,
        email: `api-test-${stamp}@example.local`,
        password: "Password123!",
      },
    });
    const token = registered.token;
    const shopId = registered.shop.id;
    assert.ok(token);
    assert.ok(shopId);

    const me = await request(baseUrl, "/auth/me", { token });
    assert.equal(me.user.shops.length, 1);

    const productResult = await request(baseUrl, `/shops/${shopId}/products`, {
      method: "POST",
      token,
      body: { name: "API Smoke Product", sku: `API-SMOKE-${stamp}`, price: 2000, cost: 900 },
    });
    const productId = productResult.product.id;

    const inventoryResult = await request(baseUrl, `/shops/${shopId}/inventory`, {
      method: "POST",
      token,
      body: {
        productId,
        quantity: 5,
        unitCost: 900,
        deliveryCost: 1200,
        deliveryMethod: "Cash",
        note: "API smoke stock",
      },
    });
    const batchId = inventoryResult.inventoryBatch.id;

    const expenses = await request(baseUrl, `/shops/${shopId}/expenses`, { token });
    assert.ok(expenses.expenses.some((expense: Json) => expense.category === "Stock Delivery" && expense.method === "Cash" && expense.amount === 1200));

    const orderResult = await request(baseUrl, `/shops/${shopId}/orders`, {
      method: "POST",
      token,
      body: {
        customer: { name: "API Customer", phone: "091234567" },
        fulfillmentStatus: "reserved",
        source: "Online",
        items: [{ productId, quantity: 2, unitPrice: 2000 }],
      },
    });
    const orderId = orderResult.order.id;

    const inventoryAfterOrder = await request(baseUrl, `/shops/${shopId}/inventory`, { token });
    const batchAfterOrder = inventoryAfterOrder.inventory.find((batch: Json) => batch.id === batchId);
    assert.equal(batchAfterOrder.reservedQuantity, 2);

    const advancedPayment = await request(baseUrl, `/shops/${shopId}/orders/${orderId}/payments`, {
      method: "POST",
      token,
      body: { method: "Cash", scope: "advanced-payment", amount: 1000 },
    });
    assert.equal(advancedPayment.payment.scope, "advanced-payment");
    assert.equal(advancedPayment.order.paymentStatus, "unpaid");

    const finalPayment = await request(baseUrl, `/shops/${shopId}/orders/${orderId}/payments`, {
      method: "POST",
      token,
      body: { method: "Cash" },
    });
    assert.equal(finalPayment.order.paymentStatus, "paid");

    const refund = await request(baseUrl, `/shops/${shopId}/orders/${orderId}/refunds`, {
      method: "POST",
      token,
      body: { method: "Cash", note: "API smoke return" },
    });
    assert.equal(refund.order.paymentStatus, "refunded");

    const inventoryAfterRefund = await request(baseUrl, `/shops/${shopId}/inventory`, { token });
    const batchAfterRefund = inventoryAfterRefund.inventory.find((batch: Json) => batch.id === batchId);
    assert.equal(batchAfterRefund.reservedQuantity, 0);

    const cancelOrderResult = await request(baseUrl, `/shops/${shopId}/orders`, {
      method: "POST",
      token,
      body: {
        customer: { name: "Cancel Customer", phone: "099999999" },
        fulfillmentStatus: "reserved",
        source: "Online",
        items: [{ productId, quantity: 1, unitPrice: 2000 }],
      },
    });
    const cancelOrderId = cancelOrderResult.order.id;
    const cancelled = await request(baseUrl, `/shops/${shopId}/orders/${cancelOrderId}/cancel`, {
      method: "POST",
      token,
      body: { reason: "API smoke cancel" },
    });
    assert.equal(cancelled.order.fulfillmentStatus, "cancelled");
    await request(baseUrl, `/shops/${shopId}/orders/${cancelOrderId}`, { method: "DELETE", token });

    const dashboard = await request(baseUrl, `/shops/${shopId}/dashboard`, { token });
    assert.ok(dashboard.summary);

    console.log(JSON.stringify({
      ok: true,
      checked: [
        "register/login/me",
        "product create",
        "inventory create",
        "delivery cost expense",
        "order stock reservation",
        "advanced payment",
        "remaining payment",
        "refund restores stock",
        "cancel/delete unpaid order",
        "dashboard",
      ],
    }, null, 2));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
