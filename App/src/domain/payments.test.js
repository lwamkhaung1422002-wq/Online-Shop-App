import { describe, expect, it } from 'vitest'
import {
  buildPaymentReconciliation,
  digitsOnly,
  filterFinanceOrders,
  paymentReferenceKey,
  paymentReferences,
  validateCodSettlement,
  validatePaymentDetails,
} from './payments.js'

function order(id, paymentStatus, fulfillmentStatus = 'reserved', total = 10000) {
  return {
    id,
    customer: { name: id, phone: '', city: '', address: '' },
    items: [
      {
        id: `${id}-line`,
        type: 'Dress',
        size: 'Size 1',
        color: 'Black',
        quantity: 1,
        unitPrice: total,
        unitCost: 5000,
        discount: 0,
        lineTotal: total,
        allocations: [],
      },
    ],
    date: '2026-06-23',
    subtotal: total,
    discount: 0,
    deliveryFee: 0,
    total,
    fulfillmentStatus,
    paymentStatus,
  }
}

describe('payment references', () => {
  it('keeps exactly the first six numeric digits from mobile input', () => {
    expect(digitsOnly(' 82-53a95 7')).toBe('825395')
  })

  it('validates COD and digital references independently', () => {
    expect(
      validatePaymentDetails({
        method: 'COD',
        billNumber: '123456',
        transactionId: '654321',
        date: '2026-06-23',
      }),
    ).toBe('')
    expect(
      validatePaymentDetails({
        method: 'COD',
        billNumber: '123456',
        transactionId: '',
        date: '2026-06-23',
      }),
    ).toContain('Transaction ID')
    expect(
      validatePaymentDetails({
        method: 'Cash',
        billNumber: '',
        transactionId: '',
        date: '2026-06-23',
      }),
    ).toBe('')
    expect(
      validatePaymentDetails({
        method: 'Other',
        billNumber: '',
        transactionId: '12345',
        date: '2026-06-23',
      }),
    ).toContain('exactly 6 digits')
  })

  it('scopes identical references to the selected payment method', () => {
    expect(paymentReferenceKey({ method: 'Cash', transactionId: '123456' })).not.toBe(
      paymentReferenceKey({ method: 'Bank Transfer', transactionId: '123456' }),
    )
  })

  it('creates independent COD bill and transaction reference keys', () => {
    const details = {
      method: 'COD',
      billNumber: '123456',
      transactionId: '654321',
    }
    const references = paymentReferences(details)

    expect(references).toHaveLength(2)
    expect(paymentReferenceKey(details, references[0])).toBe('cod-bill__123456')
    expect(paymentReferenceKey(details, references[1])).toBe('cod-transaction__654321')
  })

  it('detects duplicated COD bill and transaction references independently', () => {
    const state = buildPaymentReconciliation({
      orders: [],
      payments: [
        {
          id: 'cod-1',
          orderId: 'missing-1',
          type: 'payment',
          method: 'COD',
          billNumber: '123456',
          transactionId: '654321',
        },
        {
          id: 'cod-2',
          orderId: 'missing-2',
          type: 'payment',
          method: 'COD',
          billNumber: '123456',
          transactionId: '999999',
        },
        {
          id: 'cod-3',
          orderId: 'missing-3',
          type: 'payment',
          method: 'COD',
          billNumber: '777777',
          transactionId: '654321',
        },
      ],
    })

    expect(
      state.anomalies.filter(({ type }) => type === 'duplicate-reference'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ referenceKind: 'bill', paymentId: 'cod-2' }),
        expect.objectContaining({ referenceKind: 'transaction', paymentId: 'cod-3' }),
      ]),
    )
  })
})

describe('finance reconciliation', () => {
  it('groups every active order and identifies historical anomalies', () => {
    const unpaid = order('unpaid', 'unpaid', 'reserved', 10000)
    const paid = { ...order('paid', 'paid', 'completed', 20000), paymentId: 'pay-1' }
    const refunded = { ...order('refunded', 'refunded', 'completed', 30000), refundId: 'refund-1' }
    const cancelled = order('cancelled', 'unpaid', 'cancelled', 40000)
    const state = buildPaymentReconciliation({
      orders: [unpaid, paid, refunded, cancelled],
      payments: [
        {
          id: 'pay-1',
          orderId: 'paid',
          type: 'payment',
          method: 'Cash',
          transactionId: '123456',
        },
        {
          id: 'orphan',
          orderId: 'missing',
          type: 'payment',
          method: 'Cash',
          transactionId: '123456',
        },
      ],
    })

    expect(state.outstandingOrders.map(({ id }) => id)).toEqual(['unpaid'])
    expect(state.receivedOrders.map(({ id }) => id)).toEqual(['paid'])
    expect(state.refundedOrders.map(({ id }) => id)).toEqual(['refunded'])
    expect(state.cancelledOrders.map(({ id }) => id)).toEqual(['cancelled'])
    expect(state.totals).toEqual({ outstanding: 10000, received: 20000, refunded: 30000 })
    expect(state.anomalies.map(({ type }) => type)).toEqual(
      expect.arrayContaining(['missing-refund', 'orphan-payment', 'duplicate-reference']),
    )
  })
})

describe('COD settlements', () => {
  const details = {
    method: 'COD',
    billNumber: '123456',
    transactionId: '654321',
    date: '2026-06-23',
    amount: 30000,
  }
  const allocations = [
    { orderId: 'o1', customerName: 'A', phone: '091111111', amount: 10000 },
    { orderId: 'o2', customerName: 'B', phone: '092222222', amount: 20000 },
  ]

  it('accepts one settlement covering several phone-linked orders', () => {
    expect(validateCodSettlement(allocations, details)).toBe('')
  })

  it('rejects duplicate orders, missing phones, and mismatched totals', () => {
    expect(validateCodSettlement([...allocations, allocations[0]], details)).toContain(
      'more than once',
    )
    expect(
      validateCodSettlement([{ ...allocations[0], phone: '' }], {
        ...details,
        amount: 10000,
      }),
    ).toContain('phone')
    expect(validateCodSettlement(allocations, { ...details, amount: 29999 })).toContain(
      'must equal',
    )
  })

  it('maps one shared settlement to every linked order', () => {
    const state = buildPaymentReconciliation({
      orders: [order('o1', 'paid', 'completed', 10000), order('o2', 'paid', 'completed', 20000)].map(
        (item) => ({ ...item, paymentId: 'settlement-1' }),
      ),
      payments: [
        {
          id: 'settlement-1',
          type: 'payment',
          scope: 'cod-settlement',
          method: 'COD',
          orderIds: ['o1', 'o2'],
          allocations,
          amount: 30000,
          billNumber: '123456',
          transactionId: '654321',
        },
      ],
    })

    expect(state.settlementByOrderId.o1.id).toBe('settlement-1')
    expect(state.settlementByOrderId.o2.id).toBe('settlement-1')
    expect(state.anomalies).toEqual([])
  })

  it('recalculates status counts from phone search before applying a status filter', () => {
    const unpaid = { ...order('o1', 'unpaid'), customer: { name: 'A', phone: '09123', city: '', address: '' } }
    const paid = {
      ...order('o2', 'paid'),
      customer: { name: 'B', phone: '09123', city: '', address: '' },
      paymentId: 'p2',
    }
    const other = { ...order('o3', 'unpaid'), customer: { name: 'C', phone: '09999', city: '', address: '' } }
    const state = buildPaymentReconciliation({
      orders: [unpaid, paid, other],
      payments: [{ id: 'p2', orderId: 'o2', method: 'Cash', transactionId: '123456' }],
    })
    const result = filterFinanceOrders(state, '09123', 'phone', 'received')

    expect(result.counts).toEqual({ all: 2, outstanding: 1, received: 1, refunded: 0 })
    expect(result.orders.map(({ id }) => id)).toEqual(['o2'])
  })
})
