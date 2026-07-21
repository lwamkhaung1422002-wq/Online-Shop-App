import "dotenv/config";

import { assertLocalDatabaseUrl } from "../src/lib/local-db-guard.js";
import { prisma } from "../src/lib/prisma.js";

async function main(): Promise<void> {
  assertLocalDatabaseUrl();

  if (process.env.CONFIRM_LOCAL_DB_RESET !== "online_shop_local_dev") {
    throw new Error("Set CONFIRM_LOCAL_DB_RESET=online_shop_local_dev before resetting the local database.");
  }

  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.orderItemAllocation.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.stockAdjustment.deleteMany(),
    prisma.inventoryBatch.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.shopSetting.deleteMany(),
    prisma.shop.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  console.log("Local database reset complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
