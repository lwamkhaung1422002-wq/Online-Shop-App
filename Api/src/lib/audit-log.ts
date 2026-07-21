import type { Prisma } from "../generated/prisma/client.js";

type TransactionClient = Prisma.TransactionClient;

export async function writeAuditLog(
  tx: TransactionClient,
  input: {
    shopId: string;
    actorId?: string;
    action: string;
    entity: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      shopId: input.shopId,
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      action: input.action,
      entity: input.entity,
      ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
      metadata: input.metadata ?? {},
    },
  });
}
