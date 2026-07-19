import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const shopSettingsRouter = Router();

const paramsSchema = z.object({
  shopId: z.string().min(1),
});

const catalogSettingsSchema = z.object({
  productLabel: z.string().trim().min(1).max(40).optional(),
  option1Label: z.string().trim().min(1).max(40).optional(),
  option2Label: z.string().trim().min(1).max(40).optional(),
  option2Enabled: z.boolean().optional(),
  productListLabel: z.string().trim().min(1).max(40).optional(),
  option1ValuesLabel: z.string().trim().min(1).max(40).optional(),
  option2ValuesLabel: z.string().trim().min(1).max(40).optional(),
  option1Values: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
  option2Values: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
  paymentMethods: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        name: z.string().trim().min(1).max(80),
        type: z.enum(["normal", "cod"]).default("normal"),
        active: z.boolean().default(true),
        sortOrder: z.coerce.number().int().nonnegative().default(0),
      }),
    )
    .max(50)
    .optional(),
});

const defaultPaymentMethods = [
  { id: "cod", name: "COD", type: "cod", active: true, sortOrder: 0 },
  { id: "cash", name: "Cash", type: "normal", active: true, sortOrder: 1 },
  { id: "kbz-pay", name: "KBZ Pay", type: "normal", active: true, sortOrder: 2 },
] as const;

const defaultCatalogSettings = {
  productLabel: "Product",
  option1Label: "Option 1",
  option2Label: "Option 2",
  option2Enabled: true,
  productListLabel: "Products",
  option1ValuesLabel: "Option 1 Values",
  option2ValuesLabel: "Option 2 Values",
  option1Values: JSON.stringify(["Standard"]),
  option2Values: JSON.stringify(["General"]),
  paymentMethods: JSON.stringify(defaultPaymentMethods),
};

function uniqueValues(values: string[] | undefined) {
  if (!values) return undefined;
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizePaymentMethods(methods: z.infer<typeof catalogSettingsSchema>["paymentMethods"] | undefined) {
  if (!methods) return undefined;
  const seen = new Set<string>();
  return methods
    .map((method, index) => ({
      id: method.id.trim(),
      name: method.name.trim(),
      type: method.type,
      active: method.active,
      sortOrder: method.sortOrder ?? index,
    }))
    .filter((method) => {
      const key = method.id.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function parseJsonFallback<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function toResponseSettings<T extends { option1Values: string; option2Values: string; paymentMethods: string }>(settings: T) {
  return {
    ...settings,
    option1Values: parseJsonFallback(settings.option1Values, [] as string[]),
    option2Values: parseJsonFallback(settings.option2Values, [] as string[]),
    paymentMethods: parseJsonFallback(settings.paymentMethods, [...defaultPaymentMethods]),
  };
}

async function ensureShopSetting(shopId: string) {
  return prisma.shopSetting.upsert({
    where: { shopId },
    update: {},
    create: {
      shopId,
      ...defaultCatalogSettings,
    },
  });
}

shopSettingsRouter.use(requireAuth);

shopSettingsRouter.get("/:shopId/settings", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);

    await assertUserOwnsShop(authUser.id, shopId);

    const settings = await ensureShopSetting(shopId);

    response.status(200).json({ settings: toResponseSettings(settings) });
  } catch (error) {
    next(error);
  }
});

shopSettingsRouter.patch("/:shopId/settings", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const input = catalogSettingsSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);
    await ensureShopSetting(shopId);

    const settings = await prisma.shopSetting.update({
      where: { shopId },
      data: {
        ...(input.productLabel !== undefined ? { productLabel: input.productLabel } : {}),
        ...(input.option1Label !== undefined ? { option1Label: input.option1Label } : {}),
        ...(input.option2Label !== undefined ? { option2Label: input.option2Label } : {}),
        ...(input.option2Enabled !== undefined ? { option2Enabled: input.option2Enabled } : {}),
        ...(input.productListLabel !== undefined ? { productListLabel: input.productListLabel } : {}),
        ...(input.option1ValuesLabel !== undefined ? { option1ValuesLabel: input.option1ValuesLabel } : {}),
        ...(input.option2ValuesLabel !== undefined ? { option2ValuesLabel: input.option2ValuesLabel } : {}),
        ...(input.option1Values !== undefined ? { option1Values: JSON.stringify(uniqueValues(input.option1Values)) } : {}),
        ...(input.option2Values !== undefined ? { option2Values: JSON.stringify(uniqueValues(input.option2Values)) } : {}),
        ...(input.paymentMethods !== undefined ? { paymentMethods: JSON.stringify(normalizePaymentMethods(input.paymentMethods)) } : {}),
      },
    });

    response.status(200).json({ settings: toResponseSettings(settings) });
  } catch (error) {
    next(error);
  }
});
