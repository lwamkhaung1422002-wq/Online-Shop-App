import { isStockReserved, normalizeOrders } from '../domain/orders.js'
import { buildPaymentReconciliation, PAYMENT_METHODS } from '../domain/payments.js'

export const SIZE_OPTIONS = ['Size 1', 'Size 2', 'Other']
export const SOURCE_OPTIONS = ['Telegram', 'TikTok', 'Messenger']
export { PAYMENT_METHODS }
export const EXPENSE_METHODS = ['KBZ Pay', 'WavePay', 'AyaPay', 'Other']

export function safeParse(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function getToday() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatKs(value) {
  return `${Number(value || 0).toLocaleString()} Ks`
}

export function getVariantKey(size, color, type) {
  return `${size}__${color}__${type || '-'}`
}

export function readRecords() {
  return safeParse('monthlyRecords', {})
}

export function readStocks() {
  return safeParse('stocks', [])
}

export function readPayments() {
  return safeParse('payments', [])
}

export function readExpenses() {
  return safeParse('expenses', [])
}

export function readAdjustments() {
  return safeParse('stockAdjustments', [])
}

export function readProductTypes() {
  return safeParse('productTypes', [])
}

export function readProductColors() {
  return safeParse('productColors', [])
}

export function readLocalData() {
  return {
    records: readRecords(),
    stocks: readStocks(),
    payments: readPayments(),
    expenses: readExpenses(),
    adjustments: readAdjustments(),
    productTypes: readProductTypes(),
    productColors: readProductColors(),
  }
}

export function flattenRecords(records) {
  return Object.values(records).flat()
}

export function groupOrdersByMonth(orders) {
  const nextRecords = {}

  orders.forEach((order) => {
    const key = String(order.date || getToday()).slice(0, 7)
    if (!nextRecords[key]) nextRecords[key] = []
    nextRecords[key].push(order)
  })

  return nextRecords
}

export function buildAppState(source = readLocalData()) {
  const records = source.records || {}
  const stocks = source.stocks || []
  const payments = source.payments || []
  const orders = normalizeOrders(source.orders?.length ? source.orders : flattenRecords(records))
  const soldByVariant = {}
  const orderById = {}

  orders.forEach((order) => {
    orderById[order.id] = order

    if (!isStockReserved(order)) return
    order.items.forEach((item) => {
      const key = getVariantKey(item.size, item.color, item.type)
      soldByVariant[key] = (soldByVariant[key] || 0) + Number(item.quantity || 0)
    })
  })

  return { records, stocks, payments, orders, soldByVariant, orderById }
}

export function buildStockState(source = readLocalData()) {
  const stocks = source.stocks || []
  const records = source.records || {}
  const adjustments = source.adjustments || []
  const productTypes = source.productTypes || []
  const productColors = source.productColors || []
  const soldQtyMap = {}
  const adjustmentMap = {}

  normalizeOrders(source.orders?.length ? source.orders : flattenRecords(records)).forEach((order) => {
    if (!isStockReserved(order)) return
    order.items.forEach((item) => {
      const key = getVariantKey(item.size, item.color, item.type)
      if (!soldQtyMap[key]) soldQtyMap[key] = []
      soldQtyMap[key].push({
        date: order.date,
        qty: Number(item.quantity || 0),
      })
    })
  })

  adjustments.forEach((adjustment) => {
    const key = getVariantKey(adjustment.size, adjustment.color, adjustment.type)
    if (!adjustmentMap[key]) adjustmentMap[key] = []
    adjustmentMap[key].push(adjustment)
  })

  return { stocks, records, adjustments, productTypes, productColors, soldQtyMap, adjustmentMap }
}

export function buildSalesState(source = readLocalData()) {
  const records = source.records || {}
  const orders = normalizeOrders(source.orders?.length ? source.orders : flattenRecords(records))
  const stocks = source.stocks || []
  const productColors = source.productColors || []
  const orderById = {}
  const visitMap = {}
  const soldByVariant = {}

  orders.forEach((order) => {
    orderById[order.id] = order
    visitMap[order.customer.phone] = (visitMap[order.customer.phone] || 0) + 1

    if (!isStockReserved(order)) return
    order.items.forEach((item) => {
      const key = getVariantKey(item.size, item.color, item.type)
      soldByVariant[key] = (soldByVariant[key] || 0) + Number(item.quantity || 0)
    })
  })

  return { records, orders, stocks, productColors, orderById, visitMap, soldByVariant }
}

export function buildFinanceState(source = readLocalData()) {
  const records = source.records || {}
  return {
    records,
    ...buildPaymentReconciliation({
      ...source,
      orders: source.orders?.length ? source.orders : flattenRecords(records),
    }),
  }
}

export function buildProfitState(source = readLocalData()) {
  const records = source.records || {}
  const payments = source.payments || []
  const expenses = source.expenses || []
  const productTypes = source.productTypes || []
  const orderById = {}

  normalizeOrders(source.orders?.length ? source.orders : flattenRecords(records)).forEach((order) => {
    orderById[order.id] = order
  })

  return { records, payments, expenses, productTypes, orderById }
}

export function buildOrderState(source = readLocalData()) {
  const stocks = source.stocks || []
  const records = source.records || {}
  const productTypes = source.productTypes || []
  const productColors = source.productColors || []
  const stockQtyMap = {}
  const soldQtyMap = {}
  const stockPriceMap = {}

  stocks.forEach((stock) => {
    const key = getVariantKey(stock.size, stock.color, stock.type)
    stockQtyMap[key] = (stockQtyMap[key] || 0) + Number(stock.quantity || 0)

    if (!(key in stockPriceMap)) {
      stockPriceMap[key] = Number(stock.price || 0)
    }
  })

  normalizeOrders(source.orders?.length ? source.orders : flattenRecords(records)).forEach((order) => {
    if (!isStockReserved(order)) return
    order.items.forEach((item) => {
      const key = getVariantKey(item.size, item.color, item.type)
      soldQtyMap[key] = (soldQtyMap[key] || 0) + Number(item.quantity || 0)
    })
  })

  return { stocks, records, productTypes, productColors, stockQtyMap, soldQtyMap, stockPriceMap }
}

export function getAvailableStockFromMaps(stockQtyMap, soldQtyMap, size, color, type) {
  const key = getVariantKey(size, color, type)
  return Math.max(0, (stockQtyMap[key] || 0) - (soldQtyMap[key] || 0))
}

export function getReceivedByMethod(payments, orderById) {
  const map = {}
  const voidedSettlementIds = new Set(
    payments
      .filter((payment) => payment.type === 'cod-settlement-void')
      .map((payment) => String(payment.originalPaymentId)),
  )

  payments.forEach((payment) => {
    if (payment.refunded || payment.type === 'refund' || payment.type === 'cod-settlement-void') {
      return
    }
    if (payment.scope === 'cod-settlement') {
      if (voidedSettlementIds.has(String(payment.id))) return
      map.COD = (map.COD || 0) + Number(payment.amount || 0)
      return
    }
    const order = orderById[payment.orderId]
    if (!order || !order.received) return
    map[payment.method] = (map[payment.method] || 0) + Number(payment.amount || order.amount || 0)
  })

  return map
}
