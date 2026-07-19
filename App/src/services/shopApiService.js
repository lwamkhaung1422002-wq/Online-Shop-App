import { api, getStoredShopId } from './api.js'
import { groupOrdersByMonth } from '../utils/storage.js'
import { normalizeOrders } from '../domain/orders.js'
import {
  normalizeCatalogSettings,
  normalizeOptionPath,
  normalizeOptionTree,
  uniqueCatalogValues,
  variantDisplayName,
  variantOptionValue,
} from '../utils/catalog.js'

export const emptyData = {
  records: {},
  orders: [],
  stocks: [],
  payments: [],
  expenses: [],
  adjustments: [],
  productTypes: [],
  productColors: [],
  option1Values: [],
  option2Values: [],
  catalogSettings: normalizeCatalogSettings(),
  products: [],
  categories: [],
  customers: [],
  dashboard: null,
}

function shopIdFrom(uid) {
  return getStoredShopId() || uid
}

function dateOnly(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
}

function uniqueItems(items) {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))]
}

function variantSize(variant) {
  return variantOptionValue(variant, 0, variant?.option1 || variant?.name || 'Default')
}

function variantColor(variant) {
  return variantOptionValue(variant, 1, variant?.option2 || variant?.option3 || '-')
}

function mapProduct(product) {
  return {
    ...product,
    optionTree: normalizeOptionTree(product.optionTree),
    variants: (product.variants || []).map((variant) => ({
      ...variant,
      optionPath: normalizeOptionPath(variant.optionPath),
      displayName: variantDisplayName(variant),
    })),
  }
}

function mapStock(batch) {
  const variant = batch.variant || null
  const product = batch.product || {}
  return {
    id: String(batch.id),
    productId: batch.productId,
    variantId: batch.variantId,
    variantName: variantDisplayName(variant),
    optionPath: normalizeOptionPath(variant?.optionPath),
    date: dateOnly(batch.receivedAt || batch.createdAt),
    deli: 0,
    size: variantSize(variant),
    color: variantColor(variant),
    type: product.name || '-',
    unitCost: Number(batch.unitCost || 0),
    salePrice: Number(variant?.price ?? product.price ?? 0),
    price: Number(variant?.price ?? product.price ?? 0),
    quantity: Number(batch.quantity || 0),
    reservedQuantity: Number(batch.reservedQuantity || 0),
    note: batch.note || '',
  }
}

function mapPayment(payment) {
  return {
    ...payment,
    id: String(payment.id),
    orderId: payment.orderId ? String(payment.orderId) : null,
    orderIds: Array.isArray(payment.orderIds) ? payment.orderIds.map(String) : [],
    allocations: Array.isArray(payment.allocations) ? payment.allocations : [],
    amount: Number(payment.amount || 0),
    date: dateOnly(payment.paidAt || payment.createdAt),
    paidAt: payment.paidAt,
    refunded: payment.type === 'refund',
  }
}

function mapOrder(order, payments = []) {
  const directPayment = payments.find(
    (payment) => payment.orderId === order.id && payment.type === 'payment' && Number(payment.amount || 0) > 0,
  )
  const settlement = payments.find(
    (payment) => payment.scope === 'cod-settlement' && payment.orderIds?.map(String).includes(String(order.id)),
  )
  const refund = payments.find(
    (payment) => payment.orderId === order.id && payment.type === 'refund',
  )
  const payment = directPayment || settlement || null

  return {
    id: String(order.id),
    customer: {
      name: order.customer?.name || '',
      phone: order.customer?.phone || '',
      city: order.customer?.city || '',
      address: order.customer?.address || '',
    },
    items: (order.items || []).map((item) => ({
      id: String(item.id),
      productId: item.productId,
      variantId: item.variantId,
      type: item.productName || item.product?.name || '-',
      size: variantSize(item.variant),
      color: variantColor(item.variant),
      variantName: variantDisplayName(item.variant),
      optionPath: normalizeOptionPath(item.variant?.optionPath),
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      unitCost: Number(item.unitCost || 0),
      discount: Number(item.discount || 0),
      deductionType: item.deductionType === 'advance-payment' ? 'advance-payment' : 'discount',
      lineTotal: Number(item.lineTotal || 0),
      allocations: (item.allocations || []).map((allocation) => ({
        stockBatchId: String(allocation.inventoryBatchId || allocation.stockBatchId),
        quantity: Number(allocation.quantity || 0),
        unitCost: Number(allocation.unitCost || 0),
      })),
    })),
    date: dateOnly(order.createdAt),
    subtotal: Number(order.subtotal || 0),
    discount: Number(order.discount || 0),
    deliveryFee: Number(order.deliveryFee || 0),
    total: Number(order.total || 0),
    fulfillmentStatus: order.fulfillmentStatus || 'reserved',
    paymentStatus: order.paymentStatus || 'unpaid',
    source: order.source || '',
    remark: order.note || '',
    paymentId: payment?.id || null,
    refundId: order.refundId || refund?.id || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    received: order.paymentStatus === 'paid',
    paid: order.paymentStatus !== 'unpaid',
  }
}

function mapExpense(expense) {
  return {
    ...expense,
    id: String(expense.id),
    title: expense.title,
    amount: Number(expense.amount || 0),
    type: expense.category || 'General',
    category: expense.category || 'General',
    method: expense.method || 'Other',
    date: dateOnly(expense.spentAt || expense.createdAt),
    spentAt: expense.spentAt,
    note: expense.note || '',
  }
}

function mapAdjustment(adjustment) {
  const stock = mapStock(adjustment.inventoryBatch || {})
  return {
    id: String(adjustment.id),
    stockBatchId: String(adjustment.inventoryBatchId),
    action: adjustment.action === 'REMOVE' ? 'SUB' : adjustment.action,
    qty: Number(adjustment.quantity || 0),
    quantity: Number(adjustment.quantity || 0),
    beforeQuantity: Number(adjustment.beforeQuantity || 0),
    afterQuantity: Number(adjustment.afterQuantity || 0),
    reason: adjustment.reason || '',
    date: dateOnly(adjustment.createdAt),
    size: stock.size,
    color: stock.color,
    type: stock.type,
  }
}

async function loadUserData(uid) {
  const shopId = shopIdFrom(uid)
  if (!shopId) return emptyData

  const [
    categoriesResult,
    productsResult,
    inventoryResult,
    ordersResult,
    paymentsResult,
    expensesResult,
    adjustmentsResult,
    dashboardResult,
    customersResult,
    settingsResult,
  ] = await Promise.all([
    api.categories(shopId),
    api.products(shopId),
    api.inventory(shopId),
    api.orders(shopId),
    api.payments(shopId),
    api.expenses(shopId),
    api.adjustments(shopId),
    api.dashboard(shopId).catch(() => ({ summary: null })),
    api.customers(shopId).catch(() => ({ customers: [] })),
    api.shopSettings(shopId).catch(() => ({ settings: normalizeCatalogSettings() })),
  ])

  const payments = (paymentsResult.payments || []).map(mapPayment)
  const orders = normalizeOrders((ordersResult.orders || []).map((order) => mapOrder(order, payments)))
  const stocks = (inventoryResult.inventory || []).map(mapStock)
  const expenses = (expensesResult.expenses || []).map(mapExpense)
  const adjustments = (adjustmentsResult.adjustments || []).map(mapAdjustment)
  const products = (productsResult.products || []).map(mapProduct)
  const catalogSettings = normalizeCatalogSettings(settingsResult.settings)
  const productTypes = uniqueItems([
    ...products.map((product) => product.name),
    ...stocks.map((stock) => stock.type),
  ])
  const option1Values = uniqueCatalogValues([
    ...catalogSettings.option1Values,
    ...products.flatMap((product) => (product.variants || []).map(variantSize)),
    ...stocks.map((stock) => stock.size),
  ]).filter((item) => item !== '-')
  const option2Values = uniqueCatalogValues([
    ...catalogSettings.option2Values,
    ...products.flatMap((product) => (product.variants || []).map(variantColor)),
    ...stocks.map((stock) => stock.color),
  ]).filter((item) => item !== '-')

  return {
    records: groupOrdersByMonth(orders),
    orders,
    stocks,
    payments,
    expenses,
    adjustments,
    productTypes,
    productColors: option2Values,
    option1Values,
    option2Values,
    catalogSettings: {
      ...catalogSettings,
      option1Values,
      option2Values,
    },
    products,
    categories: categoriesResult.categories || [],
    customers: customersResult.customers || [],
    dashboard: dashboardResult.summary || dashboardResult,
  }
}

export function subscribeUserData(uid, onData, onError) {
  let active = true

  loadUserData(uid)
    .then((nextData) => {
      if (active) onData(nextData)
    })
    .catch((error) => {
      if (active) onError(error)
    })

  return () => {
    active = false
  }
}

async function ensureProduct(shopId, stock) {
  const products = (await api.products(shopId)).products || []
  const existing = products.find((product) => product.name === stock.type)
  if (existing) return existing

  const result = await api.createProduct(shopId, {
    name: stock.type || 'General Product',
    price: Number(stock.salePrice || stock.price || 0),
    cost: Number(stock.unitCost || 0),
  })
  return result.product
}

async function ensureVariant(shopId, product, stock) {
  if (stock.variantId) {
    const existingById = (product.variants || []).find((variant) => String(variant.id) === String(stock.variantId))
    if (existingById) return existingById
  }

  const size = stock.size || 'Other'
  const color = stock.color || '-'
  const variants = product.variants || []
  const existing = variants.find(
    (variant) => variantSize(variant) === size && variantColor(variant) === color,
  )
  if (existing) return existing

  const result = await api.createVariant(shopId, product.id, {
    name: color && color !== '-' ? `${size} / ${color}` : size,
    price: Number(stock.salePrice || stock.price || product.price || 0),
    cost: Number(stock.unitCost || product.cost || 0),
    option1: size,
    option2: color,
  })
  return result.variant
}

async function productVariantForLine(shopId, line, stocks = []) {
  const allocatedStock = line.allocations?.[0]?.stockBatchId
    ? stocks.find((stock) => String(stock.id) === String(line.allocations[0].stockBatchId))
    : null
  const source = allocatedStock || line
  const product = await ensureProduct(shopId, {
    type: source.type,
    salePrice: source.unitPrice,
    price: source.unitPrice,
    unitCost: source.unitCost,
  })
  const variant = await ensureVariant(shopId, product, {
    size: source.size,
    color: source.color,
    salePrice: source.unitPrice,
    price: source.unitPrice,
    unitCost: source.unitCost,
  })
  return { product, variant }
}

function paymentPayload(details, amount) {
  return {
    method: details.method,
    amount,
    billNumber: details.method === 'COD' ? details.billNumber : undefined,
    transactionId: details.transactionId,
    note: details.note,
    paidAt: details.date ? new Date(details.date).toISOString() : undefined,
  }
}

export async function saveCatalogItems(uid, key, items) {
  const shopId = shopIdFrom(uid)
  if (key === 'productTypes') {
    const products = (await api.products(shopId)).products || []
    for (const item of items) {
      if (!products.some((product) => product.name === item)) {
        await api.createProduct(shopId, { name: item, price: 0, cost: 0 })
      }
    }
  }

  if (key === 'option1Values') {
    await api.updateShopSettings(shopId, { option1Values: uniqueItems(items) })
  }
  if (key === 'productColors' || key === 'option2Values') {
    await api.updateShopSettings(shopId, { option2Values: uniqueItems(items) })
  }
}

export async function saveCatalogSettings(uid, settings) {
  return api.updateShopSettings(shopIdFrom(uid), settings)
}

export async function createProductDocument(uid, product) {
  return api.createProduct(shopIdFrom(uid), {
    name: product.name,
    price: Number(product.price || 0),
    cost: Number(product.cost || 0),
    optionTree: normalizeOptionTree(product.optionTree),
  })
}

export async function updateProductDocument(uid, productId, product) {
  return api.updateProduct(shopIdFrom(uid), productId, {
    name: product.name,
    price: Number(product.price || 0),
    cost: Number(product.cost || 0),
    isActive: product.isActive,
    optionTree: normalizeOptionTree(product.optionTree),
  })
}

export async function createVariantDocument(uid, productId, variant) {
  return api.createVariant(shopIdFrom(uid), productId, {
    name: variant.name,
    price: Number(variant.price || 0),
    cost: Number(variant.cost || 0),
    optionPath: normalizeOptionPath(variant.optionPath),
    isActive: variant.isActive ?? true,
  })
}

export async function updateVariantDocument(uid, productId, variantId, variant) {
  return api.updateVariant(shopIdFrom(uid), productId, variantId, {
    name: variant.name,
    price: Number(variant.price || 0),
    cost: Number(variant.cost || 0),
    optionPath: normalizeOptionPath(variant.optionPath),
    isActive: variant.isActive,
  })
}

export async function deleteVariantDocument(uid, productId, variantId) {
  return api.deleteVariant(shopIdFrom(uid), productId, variantId)
}

export async function createOrderAtomic(uid, order, stocks, _existingOrders, paymentDetails = null) {
  const shopId = shopIdFrom(uid)
  const items = []

  for (const item of order.items) {
    const resolved =
      item.productId && item.variantId
        ? { product: { id: item.productId }, variant: { id: item.variantId } }
        : await productVariantForLine(shopId, item, stocks)
    items.push({
      productId: resolved.product.id,
      variantId: resolved.variant?.id || undefined,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      discount: Number(item.discount || 0),
      deductionType: item.deductionType || 'discount',
    })
  }

  const result = await api.createOrder(shopId, {
    customer: order.customer,
    fulfillmentStatus: order.fulfillmentStatus === 'preorder' ? 'preorder' : 'reserved',
    discount: Number(order.discount || 0),
    deliveryFee: Number(order.deliveryFee || 0),
    source: order.source,
    note: order.remark,
    items,
  })

  if (paymentDetails) {
    await api.receivePayment(shopId, result.order.id, paymentPayload(paymentDetails, Number(result.order.total || 0)))
  }

  return result.order
}

export async function updateOrderDocument() {
  throw new Error('Order editing is not supported by the API yet.')
}

export async function deleteOrderDocument(uid, order) {
  return cancelOrderAtomic(uid, order.id, 'Order deleted by shop owner')
}

export async function cancelOrderAtomic(uid, orderId, reason = 'Order cancelled') {
  return api.cancelOrder(shopIdFrom(uid), orderId, reason)
}

export async function fulfillPreorderAtomic(uid, order) {
  return api.fulfillPreorder(shopIdFrom(uid), order.id)
}

export async function setOrderFulfillmentStatus(uid, orderId, nextStatus) {
  return api.completeOrder(shopIdFrom(uid), orderId, nextStatus)
}

export async function receivePaymentAtomic(uid, orderId, details) {
  return api.receivePayment(shopIdFrom(uid), orderId, paymentPayload(details, Number(details.amount || 0) || undefined))
}

export async function receiveCodSettlementAtomic(uid, allocations, details) {
  return api.receiveCodSettlement(shopIdFrom(uid), {
    amount: Number(details.amount || 0),
    billNumber: details.billNumber,
    transactionId: details.transactionId,
    note: details.note,
    paidAt: details.date ? new Date(details.date).toISOString() : undefined,
    allocations: allocations.map((allocation) => ({
      orderId: allocation.orderId,
      amount: Number(allocation.amount || 0),
      phone: allocation.phone,
      customerName: allocation.customerName,
    })),
  })
}

export async function voidCodSettlementAtomic(uid, payment, reason) {
  return api.voidCodSettlement(shopIdFrom(uid), payment.id, { reason })
}

export async function refundPaymentAtomic(uid, orderId, details) {
  return api.refundPayment(shopIdFrom(uid), orderId, {
    method: details.method,
    transactionId: details.transactionId,
    originalPaymentId: details.originalPaymentId,
    note: details.reason,
    paidAt: details.date ? new Date(details.date).toISOString() : undefined,
  })
}

export async function createStockBatch(uid, stock) {
  const shopId = shopIdFrom(uid)
  const product = stock.productId ? { id: stock.productId } : await ensureProduct(shopId, stock)
  const variant = stock.variantId ? { id: stock.variantId } : await ensureVariant(shopId, product, stock)

  return api.createInventory(shopId, {
    productId: product.id,
    variantId: variant?.id,
    quantity: Number(stock.quantity || 0),
    unitCost: Number(stock.unitCost || 0),
    receivedAt: stock.date ? new Date(stock.date).toISOString() : undefined,
    note: stock.deli ? `Delivery cost: ${stock.deli}` : undefined,
  })
}

export async function deleteStockBatch(uid, stock) {
  return api.deleteInventory(shopIdFrom(uid), stock.id)
}

export async function adjustStockBatch(uid, stockId, adjustment) {
  return api.adjustInventory(shopIdFrom(uid), stockId, {
    action: adjustment.action,
    quantity: Number(adjustment.quantity || adjustment.qty || 0),
    reason: adjustment.reason,
  })
}

export async function createExpenseDocument(uid, expense) {
  return api.createExpense(shopIdFrom(uid), {
    title: expense.title,
    category: expense.type,
    amount: Number(expense.amount || 0),
    spentAt: expense.date ? new Date(expense.date).toISOString() : undefined,
    note: [expense.method, expense.note].filter(Boolean).join(' · '),
  })
}

export function updateExpenseDocument(uid, expense) {
  return api.updateExpense(shopIdFrom(uid), expense.id, {
    title: expense.title,
    category: expense.type,
    amount: Number(expense.amount || 0),
    spentAt: expense.date ? new Date(expense.date).toISOString() : undefined,
    note: [expense.method, expense.note].filter(Boolean).join(' · '),
  })
}

export function deleteExpenseDocument(uid, expenseId) {
  return api.deleteExpense(shopIdFrom(uid), expenseId)
}

export async function deleteUserCollectionDoc() {
  throw new Error('Direct collection deletes are disabled after API migration.')
}

export async function migrateUserDataToV2() {
  return { migratedOrders: 0, skippedOrders: 0 }
}

export async function refreshUserData(uid) {
  return loadUserData(uid)
}
