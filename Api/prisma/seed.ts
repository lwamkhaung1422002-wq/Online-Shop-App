import "dotenv/config";

import bcrypt from "bcrypt";

import { assertLocalDatabaseUrl } from "../src/lib/local-db-guard.js";
import { prisma } from "../src/lib/prisma.js";

const sampleEmail = "owner@example.local";
const samplePassword = "Password123!";

function today(offsetDays = 0): Date {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date;
}

async function main(): Promise<void> {
  assertLocalDatabaseUrl();

  const password = await bcrypt.hash(samplePassword, 12);
  const user = await prisma.user.upsert({
    where: { email: sampleEmail },
    update: { name: "Local Demo Owner", password },
    create: { name: "Local Demo Owner", email: sampleEmail, password },
  });

  const shop = await prisma.shop.upsert({
    where: { id: "local-demo-shop" },
    update: { name: "Local Demo Shop", ownerId: user.id },
    create: { id: "local-demo-shop", name: "Local Demo Shop", ownerId: user.id },
  });

  await prisma.shopSetting.upsert({
    where: { shopId: shop.id },
    update: {
      paymentMethods: JSON.stringify([
        { id: "cash", name: "Cash", type: "normal", active: true, sortOrder: 0 },
        { id: "mobile-pay", name: "Mobile Pay", type: "normal", active: true, sortOrder: 1 },
        { id: "cod", name: "Delivery Collection", type: "cod", active: true, sortOrder: 2 },
      ]),
    },
    create: {
      shopId: shop.id,
      paymentMethods: JSON.stringify([
        { id: "cash", name: "Cash", type: "normal", active: true, sortOrder: 0 },
        { id: "mobile-pay", name: "Mobile Pay", type: "normal", active: true, sortOrder: 1 },
        { id: "cod", name: "Delivery Collection", type: "cod", active: true, sortOrder: 2 },
      ]),
    },
  });

  const simpleProduct = await prisma.product.upsert({
    where: { shopId_sku: { shopId: shop.id, sku: "LOCAL-SIMPLE" } },
    update: { name: "Sample Notebook", price: 3500, cost: 1800, isActive: true },
    create: { shopId: shop.id, sku: "LOCAL-SIMPLE", name: "Sample Notebook", price: 3500, cost: 1800 },
  });

  const optionTree = {
    levels: [
      { id: "size", label: "Size", level: 0 },
      { id: "color", label: "Color", level: 1 },
      { id: "type", label: "Type", level: 2 },
    ],
    values: [
      { id: "size-small", label: "Small", level: 0, parentId: null },
      { id: "size-medium", label: "Medium", level: 0, parentId: null },
      { id: "color-brown", label: "Brown", level: 1, parentId: null },
      { id: "color-black", label: "Black", level: 1, parentId: null },
      { id: "type-regular", label: "Regular", level: 2, parentId: null },
    ],
  };
  const optionProduct = await prisma.product.upsert({
    where: { shopId_sku: { shopId: shop.id, sku: "LOCAL-DRESS" } },
    update: { name: "Sample Dress", price: 42000, cost: 23000, optionTree, isActive: true },
    create: { shopId: shop.id, sku: "LOCAL-DRESS", name: "Sample Dress", price: 42000, cost: 23000, optionTree },
  });

  const variantPath = [
    { level: 0, label: "Size", valueId: "size-small", value: "Small" },
    { level: 1, label: "Color", valueId: "color-brown", value: "Brown" },
    { level: 2, label: "Type", valueId: "type-regular", value: "Regular" },
  ];
  const variant = await prisma.productVariant.upsert({
    where: { productId_variantSignature: { productId: optionProduct.id, variantSignature: "0:size-small|1:color-brown|2:type-regular" } },
    update: { name: "Small / Brown / Regular", price: 42000, cost: 23000, optionPath: variantPath, isActive: true, archivedAt: null },
    create: {
      productId: optionProduct.id,
      name: "Small / Brown / Regular",
      price: 42000,
      cost: 23000,
      option1: "Small",
      option2: "Brown",
      option3: "Regular",
      optionPath: variantPath,
      variantSignature: "0:size-small|1:color-brown|2:type-regular",
    },
  });

  await prisma.inventoryBatch.deleteMany({
    where: { shopId: shop.id, note: { in: ["Seed stock", "Seed variant stock"] } },
  });
  await prisma.expense.deleteMany({
    where: { shopId: shop.id, note: "Local seed expense" },
  });

  await prisma.inventoryBatch.createMany({
    data: [
      { shopId: shop.id, productId: simpleProduct.id, quantity: 20, unitCost: 1800, receivedAt: today(-4), note: "Seed stock" },
      { shopId: shop.id, productId: optionProduct.id, variantId: variant.id, quantity: 12, unitCost: 23000, receivedAt: today(-3), note: "Seed variant stock" },
    ],
    skipDuplicates: true,
  });

  await prisma.expense.create({
    data: {
      shopId: shop.id,
      title: "Sample packaging",
      category: "Packaging",
      method: "Cash",
      amount: 5000,
      spentAt: today(-2),
      note: "Local seed expense",
    },
  });

  console.log(`Seed complete. Sample login: ${sampleEmail} / ${samplePassword}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
