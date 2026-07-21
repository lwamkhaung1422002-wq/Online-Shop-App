import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { assertLocalDatabaseUrl } from "../src/lib/local-db-guard.js";
import { prisma } from "../src/lib/prisma.js";

const tables = [
  "User",
  "Shop",
  "ShopSetting",
  "Customer",
  "Category",
  "Product",
  "ProductVariant",
  "InventoryBatch",
  "StockAdjustment",
  "Order",
  "OrderItem",
  "OrderItemAllocation",
  "Payment",
  "Expense",
  "AuditLog",
];

async function exportTable(table: string): Promise<unknown[]> {
  const exists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = $1)`,
    table,
  );

  if (!exists[0]?.exists) return [];

  const rows = await prisma.$queryRawUnsafe<Array<{ data: unknown }>>(
    `select to_jsonb(t) as data from "${table}" t`,
  );

  return rows.map((row) => row.data);
}

async function main(): Promise<void> {
  assertLocalDatabaseUrl();

  const backupDir = join(process.cwd(), "local-backups");
  await mkdir(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupDir, `online-shop-local-${timestamp}.json`);

  const backup: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
  };

  for (const table of tables) {
    backup[table] = await exportTable(table);
  }

  await writeFile(backupPath, JSON.stringify(backup, null, 2), "utf8");
  console.log(`Local database backup written: ${backupPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
