import { describe, expect, it } from 'vitest'
import { allocateFifo, getAvailableByVariant } from './inventory.js'
import { getVariantKey } from '../utils/storage.js'

const stocks = [
  {
    id: 'old',
    date: '2026-01-01',
    type: 'Dress',
    size: 'Size 1',
    color: 'Black',
    quantity: 2,
    unitCost: 10000,
  },
  {
    id: 'new',
    date: '2026-02-01',
    type: 'Dress',
    size: 'Size 1',
    color: 'Black',
    quantity: 3,
    unitCost: 12000,
  },
]

describe('FIFO inventory', () => {
  it('allocates oldest batches first and calculates weighted unit cost', () => {
    const result = allocateFifo(stocks, [], [
      {
        id: 'line',
        type: 'Dress',
        size: 'Size 1',
        color: 'Black',
        quantity: 4,
      },
    ])

    expect(result.ok).toBe(true)
    expect(result.allocations[0].allocations).toEqual([
      { stockBatchId: 'old', quantity: 2, unitCost: 10000 },
      { stockBatchId: 'new', quantity: 2, unitCost: 12000 },
    ])
    expect(result.allocations[0].unitCost).toBe(11000)
  })

  it('reports a shortage instead of overselling', () => {
    const result = allocateFifo(stocks, [], [
      {
        id: 'line',
        type: 'Dress',
        size: 'Size 1',
        color: 'Black',
        quantity: 6,
      },
    ])
    expect(result.ok).toBe(false)
    expect(result.shortage.missing).toBe(1)
  })

  it('subtracts reserved multi-item orders from availability', () => {
    const available = getAvailableByVariant(stocks, [
      {
        id: 'order',
        customer: { name: '', phone: '', city: '', address: '' },
        date: '2026-03-01',
        items: [
          {
            id: 'line',
            type: 'Dress',
            size: 'Size 1',
            color: 'Black',
            quantity: 3,
            unitPrice: 20000,
            unitCost: 10000,
            discount: 0,
            lineTotal: 60000,
            allocations: [],
          },
        ],
        fulfillmentStatus: 'reserved',
        paymentStatus: 'unpaid',
        total: 60000,
      },
    ])

    expect(available[getVariantKey('Size 1', 'Black', 'Dress')]).toBe(2)
  })
})

