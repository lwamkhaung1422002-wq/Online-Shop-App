import { prisma } from "./prisma.js";

export async function userOwnsShop(userId: string, shopId: string): Promise<boolean> {
  const shop = await prisma.shop.findFirst({
    where: {
      id: shopId,
      ownerId: userId,
    },
    select: {
      id: true,
    },
  });

  return Boolean(shop);
}

export async function assertUserOwnsShop(userId: string, shopId: string): Promise<void> {
  const ownsShop = await userOwnsShop(userId, shopId);

  if (!ownsShop) {
    const error = new Error("Shop not found.");
    error.name = "NotFoundError";
    throw error;
  }
}
