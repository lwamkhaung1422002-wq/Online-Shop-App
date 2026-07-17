import "dotenv/config";

import { app } from "./app.js";
import { prisma } from "./lib/prisma.js";

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be a valid port number.");
}

async function startServer(): Promise<void> {
  await prisma.$connect();

  const server = app.listen(port, () => {
    console.log(`API server is running at http://localhost:${port}`);
  });

  async function shutdown(signal: string): Promise<void> {
    console.log(`${signal} received. Shutting down...`);

    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

startServer().catch(async (error: unknown) => {
  console.error("Failed to start the API server:", error);
  await prisma.$disconnect();
  process.exit(1);
});
