import { getOrderCost, isRevenueRecognized, normalizeOrders } from './orders.js'

export function calculateFinancialSummary(orders = [], expenses = []) {
  const normalized = normalizeOrders(orders)
  const recognized = normalized.filter(isRevenueRecognized)
  const revenue = recognized.reduce((sum, order) => sum + Number(order.total || 0), 0)
  const costOfGoods = recognized.reduce((sum, order) => sum + getOrderCost(order), 0)
  const grossProfit = revenue - costOfGoods
  const operatingExpenses = expenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0,
  )

  return {
    revenue,
    costOfGoods,
    grossProfit,
    operatingExpenses,
    netProfit: grossProfit - operatingExpenses,
  }
}

