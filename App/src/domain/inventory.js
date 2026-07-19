import { getItemVariantKey } from '../utils/storage.js'
import { isStockReserved, normalizeOrders } from './orders.js'

export function sortStockBatches(stocks = []) {
  return [...stocks].sort((a, b) => {
    const dateCompare = String(a.date || '').localeCompare(String(b.date || ''))
    if (dateCompare) return dateCompare
    return String(a.id || '').localeCompare(String(b.id || ''))
  })
}

export function getReservedByBatch(orders = []) {
  const reserved = {}

  normalizeOrders(orders).forEach((order) => {
    if (!isStockReserved(order)) return
    order.items.forEach((item) => {
      item.allocations.forEach((allocation) => {
        reserved[allocation.stockBatchId] =
          (reserved[allocation.stockBatchId] || 0) + Number(allocation.quantity || 0)
      })
    })
  })

  return reserved
}

export function getLegacyReservedByVariant(orders = []) {
  const reserved = {}

  normalizeOrders(orders).forEach((order) => {
    if (!isStockReserved(order)) return
    order.items.forEach((item) => {
      if (item.allocations.length) return
      const key = getItemVariantKey(item)
      reserved[key] = (reserved[key] || 0) + Number(item.quantity || 0)
    })
  })

  return reserved
}

export function allocateFifo(stocks, orders, requestedItems) {
  const reservedByBatch = getReservedByBatch(orders)
  const legacyByVariant = getLegacyReservedByVariant(orders)
  const workingReserved = { ...reservedByBatch }
  const allocations = []

  for (const requested of requestedItems) {
    const key = getItemVariantKey(requested)
    const batches = sortStockBatches(stocks).filter(
      (stock) => getItemVariantKey(stock) === key,
    )

    let legacyRemaining = legacyByVariant[key] || 0
    let needed = Number(requested.quantity || 0)
    const lineAllocations = []

    for (const batch of batches) {
      const batchId = String(batch.id)
      const batchQty = Number(batch.quantity || 0)
      const explicitReserved = Number(workingReserved[batchId] || 0)
      const legacyReserved = Math.min(Math.max(0, batchQty - explicitReserved), legacyRemaining)
      legacyRemaining -= legacyReserved
      const available = Math.max(0, batchQty - explicitReserved - legacyReserved)
      const take = Math.min(available, needed)

      if (take > 0) {
        lineAllocations.push({
          stockBatchId: batchId,
          quantity: take,
          unitCost: Number(batch.unitCost ?? batch.cost ?? batch.price ?? 0),
        })
        workingReserved[batchId] = explicitReserved + take
        needed -= take
      }

      if (needed <= 0) break
    }

    if (needed > 0) {
      return {
        ok: false,
        shortage: {
          itemId: requested.id,
          type: requested.type,
          size: requested.size,
          color: requested.color,
          requested: Number(requested.quantity || 0),
          missing: needed,
        },
      }
    }

    const totalCost = lineAllocations.reduce(
      (sum, allocation) => sum + allocation.quantity * allocation.unitCost,
      0,
    )
    allocations.push({
      itemId: requested.id,
      allocations: lineAllocations,
      unitCost: Number(requested.quantity || 0)
        ? totalCost / Number(requested.quantity || 0)
        : 0,
    })
  }

  return { ok: true, allocations }
}

export function getReservationBaseline(stocks = [], orders = []) {
  const explicit = getReservedByBatch(orders)
  const baseline = { ...explicit }
  const legacyByVariant = getLegacyReservedByVariant(orders)

  Object.entries(legacyByVariant).forEach(([variantKey, reservedQuantity]) => {
    let remaining = reservedQuantity
    const batches = sortStockBatches(stocks).filter((stock) => getItemVariantKey(stock) === variantKey)

    batches.forEach((batch) => {
      if (remaining <= 0) return
      const batchId = String(batch.id)
      const capacity = Math.max(0, Number(batch.quantity || 0) - Number(baseline[batchId] || 0))
      const take = Math.min(capacity, remaining)
      baseline[batchId] = Number(baseline[batchId] || 0) + take
      remaining -= take
    })
  })

  return baseline
}

export function getAvailableByVariant(stocks = [], orders = []) {
  const totals = {}
  stocks.forEach((stock) => {
    const key = getItemVariantKey(stock)
    totals[key] = (totals[key] || 0) + Number(stock.quantity || 0)
  })

  normalizeOrders(orders).forEach((order) => {
    if (!isStockReserved(order)) return
    order.items.forEach((item) => {
      const key = getItemVariantKey(item)
      totals[key] = (totals[key] || 0) - Number(item.quantity || 0)
    })
  })

  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.max(0, value)]))
}
