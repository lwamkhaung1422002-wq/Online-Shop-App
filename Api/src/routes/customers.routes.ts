import { Router } from "express";
import { z } from "zod";

import type { Prisma } from "../generated/prisma/client.js";
import { assertUserOwnsShop } from "../lib/shop-access.js";
import { prisma } from "../lib/prisma.js";
import { getAuthUser, requireAuth } from "../middleware/auth.middleware.js";

export const customersRouter = Router();

const paramsSchema = z.object({
  shopId: z.string().min(1),
});

const customerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required."),
  phone: z.string().trim().optional(),
  email: z.email().trim().toLowerCase().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

const updateCustomerSchema = customerSchema.partial();

customersRouter.use(requireAuth);

customersRouter.get("/:shopId/customers", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);

    await assertUserOwnsShop(authUser.id, shopId);

    const customers = await prisma.customer.findMany({
      where: { shopId },
      orderBy: { createdAt: "desc" },
    });

    response.status(200).json({ customers });
  } catch (error) {
    next(error);
  }
});

customersRouter.post("/:shopId/customers", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const input = customerSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);

    const data: Prisma.CustomerUncheckedCreateInput = {
      name: input.name,
      shopId,
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };

    const customer = await prisma.customer.create({
      data,
    });

    response.status(201).json({ customer });
  } catch (error) {
    next(error);
  }
});

customersRouter.patch("/:shopId/customers/:customerId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const customerId = z.string().min(1).parse(request.params.customerId);
    const input = updateCustomerSchema.parse(request.body);

    await assertUserOwnsShop(authUser.id, shopId);

    const existingCustomer = await prisma.customer.findFirst({
      where: { id: customerId, shopId },
      select: { id: true },
    });

    if (!existingCustomer) {
      const error = new Error("Customer not found.");
      error.name = "NotFoundError";
      throw error;
    }

    const data: Prisma.CustomerUncheckedUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };

    const customer = await prisma.customer.update({
      where: { id: customerId },
      data,
    });

    response.status(200).json({ customer });
  } catch (error) {
    next(error);
  }
});

customersRouter.delete("/:shopId/customers/:customerId", async (request, response, next) => {
  try {
    const authUser = getAuthUser(request);
    const { shopId } = paramsSchema.parse(request.params);
    const customerId = z.string().min(1).parse(request.params.customerId);

    await assertUserOwnsShop(authUser.id, shopId);

    const existingCustomer = await prisma.customer.findFirst({
      where: { id: customerId, shopId },
      select: { id: true },
    });

    if (!existingCustomer) {
      const error = new Error("Customer not found.");
      error.name = "NotFoundError";
      throw error;
    }

    await prisma.customer.delete({ where: { id: customerId } });

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
