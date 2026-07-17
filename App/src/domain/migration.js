import { allocateFifo, getReservationBaseline } from './inventory.js'
import { isStockReserved, normalizeOrder } from './orders.js'

export function prepareV2Migration(stocks = [], rawOrders = []) {
  const migrated = []
  const failures = []
  const sortedOrders = [...rawOrders].sort((a, b) => {
    const dateCompare = String(a.date || '').localeCompare(String(b.date || ''))
    if (dateCompare) return dateCompare
    return String(a.id || '').localeCompare(String(b.id || ''))
  })

  sortedOrders.forEach((rawOrder) => {
      let order = normalizeOrder(rawOrder)
      if (isStockReserved(order) && order.items.every((item) => !item.allocations.length)) {
        const allocation = allocateFifo(stocks, migrated, order.items)
        if (allocation.ok) {
          order = {
            ...order,
            items: order.items.map((item) => {
              const line = allocation.allocations.find((entry) => entry.itemId === item.id)
              return {
                ...item,
                allocations: line.allocations,
                unitCost: line.unitCost,
              }
            }),
          }
        } else {
          failures.push({
            orderId: order.id,
            reason: `Insufficient historical stock for ${allocation.shortage.type}`,
          })
        }
      }
      migrated.push({ ...order, schemaVersion: 2, _needsMigration: false })
  })

  return {
    orders: migrated,
    reservationByBatch: getReservationBaseline(stocks, migrated),
    failures,
    counts: {
      total: rawOrders.length,
      migrated: migrated.length - failures.length,
      warnings: failures.length,
    },
  }
}
