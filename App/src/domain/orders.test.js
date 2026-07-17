import { describe, expect, it } from 'vitest'
import { calculateOrderTotals, normalizeOrder } from './orders.js'

describe('order model', () => {
  it('migrates a legacy single-item order without changing its total', () => {
    const order = normalizeOrder({
      id: 123,
      customer: 'မမိုး',
      phone: '091234567',
      date: '2026-06-21',
      type: 'Dress',
      size: 'Size 1',
      color: 'Black',
      quantity: 2,
      price: 25000,
      stockPrice: 15000,
      amount: 50000,
      status: 'pending',
      paid: false,
    })

    expect(order.id).toBe('123')
    expect(order.customer.name).toBe('မမိုး')
    expect(order.items).toHaveLength(1)
    expect(order.items[0].quantity).toBe(2)
    expect(order.total).toBe(50000)
    expect(order.fulfillmentStatus).toBe('reserved')
  })

  it('calculates line, order discount, delivery, and total', () => {
    const result = calculateOrderTotals(
      [
        { unitPrice: 10000, quantity: 2, discount: 1000 },
        { unitPrice: 5000, quantity: 1, discount: 0 },
      ],
      2000,
      1500,
    )

    expect(result).toEqual({
      subtotal: 24000,
      discount: 2000,
      deliveryFee: 1500,
      total: 23500,
    })
  })

  it('defaults legacy line deductions to discount and preserves advance payment labels', () => {
    const order = normalizeOrder({
      id: 'order-1',
      customer: { name: 'Customer', phone: '091234567' },
      date: '2026-06-22',
      items: [
        {
          id: 'item-1',
          type: 'Dress',
          size: 'Size 1',
          color: 'Black',
          quantity: 1,
          unitPrice: 25000,
          discount: 1000,
        },
        {
          id: 'item-2',
          type: 'Shirt',
          size: 'Size 2',
          color: 'White',
          quantity: 1,
          unitPrice: 20000,
          discount: 5000,
          deductionType: 'advance-payment',
        },
      ],
      fulfillmentStatus: 'reserved',
      paymentStatus: 'unpaid',
    })

    expect(order.items[0].deductionType).toBe('discount')
    expect(order.items[1].deductionType).toBe('advance-payment')
    expect(order.subtotal).toBe(39000)
  })
})
