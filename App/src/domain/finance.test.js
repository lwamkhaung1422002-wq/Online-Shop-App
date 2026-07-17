import { describe, expect, it } from 'vitest'
import { calculateFinancialSummary } from './finance.js'
import { getReceivedByMethod } from '../utils/storage.js'

describe('financial summary', () => {
  it('separates revenue, COGS, gross profit, expenses, and net profit', () => {
    const orders = [
      {
        id: 'o1',
        customer: { name: 'A', phone: '', city: '', address: '' },
        date: '2026-06-21',
        items: [
          {
            id: 'i1',
            type: 'Dress',
            size: 'Size 1',
            color: 'Black',
            quantity: 2,
            unitPrice: 25000,
            unitCost: 15000,
            discount: 0,
            lineTotal: 50000,
            allocations: [],
          },
        ],
        subtotal: 50000,
        discount: 0,
        deliveryFee: 0,
        total: 50000,
        fulfillmentStatus: 'completed',
        paymentStatus: 'paid',
      },
    ]
    const summary = calculateFinancialSummary(orders, [{ amount: 5000 }])

    expect(summary).toEqual({
      revenue: 50000,
      costOfGoods: 30000,
      grossProfit: 20000,
      operatingExpenses: 5000,
      netProfit: 15000,
    })
  })
})

describe('payment method balances', () => {
  it('counts a multi-order COD settlement once and excludes its void correction', () => {
    const settlement = {
      id: 'settlement-1',
      type: 'payment',
      scope: 'cod-settlement',
      method: 'COD',
      orderIds: ['o1', 'o2'],
      amount: 70000,
    }
    expect(getReceivedByMethod([settlement], {})).toEqual({ COD: 70000 })
    expect(
      getReceivedByMethod(
        [
          settlement,
          {
            id: 'void-1',
            type: 'cod-settlement-void',
            originalPaymentId: 'settlement-1',
            amount: -70000,
          },
        ],
        {},
      ),
    ).toEqual({})
  })
})
