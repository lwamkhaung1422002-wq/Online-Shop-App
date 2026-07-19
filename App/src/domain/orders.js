import { z } from 'zod'

const numberField = z.coerce.number().finite().default(0)
const deductionTypeSchema = z.enum(['discount', 'advance-payment']).default('discount')

export function deductionLabel(type) {
  return type === 'advance-payment' ? 'Advance Payment' : 'Line discount'
}

export const allocationSchema = z.object({
  stockBatchId: z.string(),
  quantity: numberField.pipe(z.number().nonnegative()),
  unitCost: numberField.pipe(z.number().nonnegative()),
})

export const orderItemSchema = z.object({
  id: z.string(),
  productId: z.string().optional(),
  variantId: z.string().nullable().optional(),
  variantName: z.string().optional(),
  optionPath: z.array(z.any()).default([]),
  type: z.string().default('-'),
  size: z.string().default('Other'),
  color: z.string().default('-'),
  quantity: numberField.pipe(z.number().positive()),
  unitPrice: numberField.pipe(z.number().nonnegative()),
  unitCost: numberField.pipe(z.number().nonnegative()),
  discount: numberField.pipe(z.number().nonnegative()),
  deductionType: deductionTypeSchema,
  lineTotal: numberField.pipe(z.number().nonnegative()),
  allocations: z.array(allocationSchema).default([]),
})

export const orderSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  customer: z.object({
    name: z.string().default(''),
    phone: z.string().default(''),
    city: z.string().default(''),
    address: z.string().default(''),
  }),
  items: z.array(orderItemSchema).min(1),
  date: z.string(),
  subtotal: numberField,
  discount: numberField,
  deliveryFee: numberField,
  total: numberField,
  fulfillmentStatus: z.enum(['draft', 'reserved', 'completed', 'cancelled', 'preorder']),
  paymentStatus: z.enum(['unpaid', 'paid', 'refunded']),
  source: z.string().default(''),
  remark: z.string().default(''),
  paymentId: z.string().nullable().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
})

export function lineTotal(item) {
  return Math.max(
    0,
    Number(item.unitPrice || 0) * Number(item.quantity || 0) - Number(item.discount || 0),
  )
}

export function calculateOrderTotals(items, discount = 0, deliveryFee = 0) {
  const subtotal = items.reduce((sum, item) => sum + lineTotal(item), 0)
  const safeDiscount = Math.min(Math.max(0, Number(discount || 0)), subtotal)
  const safeDeliveryFee = Math.max(0, Number(deliveryFee || 0))

  return {
    subtotal,
    discount: safeDiscount,
    deliveryFee: safeDeliveryFee,
    total: Math.max(0, subtotal - safeDiscount + safeDeliveryFee),
  }
}

export function getLegacyStatus(order) {
  if (order.status === 'preorder' || order.isPreorder) return 'preorder'
  if (order.status === 'completed') return 'completed'
  if (order.status === 'cancelled') return 'cancelled'
  return 'reserved'
}

export function normalizeOrder(rawOrder) {
  if (!rawOrder) return null

  const id = String(rawOrder.id ?? '')
  const hasItems = Array.isArray(rawOrder.items) && rawOrder.items.length > 0
  const items = hasItems
    ? rawOrder.items.map((item, index) => {
        const normalized = {
          id: String(item.id ?? `${id}-item-${index + 1}`),
          productId: item.productId ? String(item.productId) : undefined,
          variantId: item.variantId ? String(item.variantId) : null,
          variantName: item.variantName || '',
          optionPath: Array.isArray(item.optionPath) ? item.optionPath : [],
          type: item.type || '-',
          size: item.size || 'Other',
          color: item.color || '-',
          quantity: Math.max(1, Number(item.quantity || 1)),
          unitPrice: Math.max(0, Number(item.unitPrice ?? item.price ?? 0)),
          unitCost: Math.max(0, Number(item.unitCost ?? item.stockPrice ?? 0)),
          discount: Math.max(0, Number(item.discount || 0)),
          deductionType: item.deductionType === 'advance-payment' ? 'advance-payment' : 'discount',
          allocations: Array.isArray(item.allocations) ? item.allocations : [],
        }
        return { ...normalized, lineTotal: lineTotal(normalized) }
      })
    : [
        {
          id: `${id}-item-1`,
          productId: rawOrder.productId ? String(rawOrder.productId) : undefined,
          variantId: rawOrder.variantId ? String(rawOrder.variantId) : null,
          variantName: rawOrder.variantName || '',
          optionPath: Array.isArray(rawOrder.optionPath) ? rawOrder.optionPath : [],
          type: rawOrder.type || '-',
          size: rawOrder.size || 'Other',
          color: rawOrder.color || '-',
          quantity: Math.max(1, Number(rawOrder.quantity || 1)),
          unitPrice: Math.max(0, Number(rawOrder.price || 0)),
          unitCost: Math.max(0, Number(rawOrder.stockPrice || 0)),
          discount: 0,
          deductionType: 'discount',
          lineTotal:
            Number(rawOrder.amount || 0) ||
            Math.max(0, Number(rawOrder.price || 0) * Number(rawOrder.quantity || 1)),
          allocations: [],
        },
      ]

  const calculated = calculateOrderTotals(
    items,
    rawOrder.discount || 0,
    rawOrder.deliveryFee || 0,
  )

  const order = {
    ...rawOrder,
    id,
    schemaVersion: 2,
    customer: {
      name: rawOrder.customer?.name ?? rawOrder.customer ?? '',
      phone: rawOrder.customer?.phone ?? rawOrder.phone ?? '',
      city: rawOrder.customer?.city ?? rawOrder.city ?? '',
      address: rawOrder.customer?.address ?? rawOrder.address ?? '',
    },
    items,
    date: rawOrder.date || new Date().toISOString().slice(0, 10),
    subtotal: Number(rawOrder.subtotal ?? calculated.subtotal),
    discount: Number(rawOrder.discount ?? calculated.discount),
    deliveryFee: Number(rawOrder.deliveryFee ?? calculated.deliveryFee),
    total: Number(rawOrder.total ?? rawOrder.amount ?? calculated.total),
    fulfillmentStatus: rawOrder.fulfillmentStatus || getLegacyStatus(rawOrder),
    paymentStatus:
      rawOrder.paymentStatus ||
      (rawOrder.refunded ? 'refunded' : rawOrder.received || rawOrder.paid ? 'paid' : 'unpaid'),
    source: rawOrder.source || '',
    remark: rawOrder.remark || '',
    paymentId: rawOrder.paymentId ? String(rawOrder.paymentId) : null,
    _needsMigration: rawOrder.schemaVersion !== 2,
  }

  // Compatibility fields keep the old screens and exported backups readable during migration.
  return {
    ...order,
    type: order.items[0]?.type || '-',
    size: order.items[0]?.size || 'Other',
    color: order.items[0]?.color || '-',
    price: order.items[0]?.unitPrice || 0,
    stockPrice: order.items[0]?.unitCost || 0,
    customerName: order.customer.name,
    phone: order.customer.phone,
    city: order.customer.city,
    address: order.customer.address,
    amount: order.total,
    quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
    paid: order.paymentStatus !== 'unpaid',
    received: order.paymentStatus === 'paid',
    status:
      order.fulfillmentStatus === 'preorder'
        ? 'preorder'
        : order.fulfillmentStatus === 'completed'
          ? 'completed'
          : order.fulfillmentStatus === 'cancelled'
            ? 'cancelled'
            : 'pending',
  }
}

export function normalizeOrders(orders = []) {
  return orders.map(normalizeOrder).filter(Boolean)
}

export function getOrderQuantity(order) {
  return normalizeOrder(order)?.items.reduce((sum, item) => sum + item.quantity, 0) || 0
}

export function getOrderCost(order) {
  return (
    normalizeOrder(order)?.items.reduce(
      (sum, item) => sum + Number(item.unitCost || 0) * Number(item.quantity || 0),
      0,
    ) || 0
  )
}

export function orderSearchText(order) {
  const normalized = normalizeOrder(order)
  if (!normalized) return ''

  return [
    normalized.id,
    normalized.date,
    normalized.customer.name,
    normalized.customer.phone,
    normalized.customer.city,
    normalized.customer.address,
    normalized.source,
    normalized.remark,
    ...normalized.items.flatMap((item) => [item.type, item.size, item.color]),
  ]
    .join(' ')
    .toLowerCase()
}

export function isStockReserved(order) {
  const status = normalizeOrder(order)?.fulfillmentStatus
  return status === 'reserved' || status === 'completed'
}

export function isRevenueRecognized(order) {
  const normalized = normalizeOrder(order)
  return (
    normalized &&
    normalized.paymentStatus === 'paid' &&
    normalized.fulfillmentStatus !== 'preorder' &&
    normalized.fulfillmentStatus !== 'cancelled'
  )
}
