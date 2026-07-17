import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const responsive = vi.hoisted(() => ({ mobile: false }))

vi.mock('@mui/material', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    useMediaQuery: () => responsive.mobile,
  }
})

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { uid: 'synthetic-owner' } }),
}))

vi.mock('../contexts/DataContext.jsx', () => ({
  useData: () => ({
    data: {
      payments: [
        {
          id: 'payment-1',
          orderId: 'paid-order',
          type: 'payment',
          method: 'KBZ Pay 1',
          transactionId: '123456',
          amount: 30000,
        },
        {
          id: 'payment-2',
          orderId: 'refunded-order',
          type: 'payment',
          method: 'COD',
          billNumber: '112233',
          transactionId: '445566',
          amount: 20000,
        },
        {
          id: 'refund-1',
          orderId: 'refunded-order',
          originalPaymentId: 'payment-2',
          type: 'refund',
          method: 'KBZ Pay 2',
          transactionId: '345678',
          amount: -20000,
        },
      ],
      orders: [
        {
          id: 'unpaid-order',
          customer: { name: 'Outstanding Customer', phone: '091111111', city: 'Yangon', address: '' },
          items: [
            {
              id: 'line-1',
              type: 'Dress',
              size: 'Size 1',
              color: 'Black',
              quantity: 1,
              unitPrice: 45000,
              unitCost: 30000,
              discount: 0,
              lineTotal: 45000,
              allocations: [],
            },
          ],
          date: '2026-06-23',
          subtotal: 45000,
          discount: 0,
          deliveryFee: 0,
          total: 45000,
          fulfillmentStatus: 'reserved',
          paymentStatus: 'unpaid',
          source: 'Telegram',
        },
        {
          id: 'paid-order',
          customer: { name: 'Paid Customer', phone: '092222222', city: 'Mandalay', address: '' },
          items: [
            {
              id: 'line-2',
              type: 'Shirt',
              size: 'Size 2',
              color: 'White',
              quantity: 1,
              unitPrice: 30000,
              unitCost: 20000,
              discount: 0,
              lineTotal: 30000,
              allocations: [],
            },
          ],
          date: '2026-06-22',
          subtotal: 30000,
          discount: 0,
          deliveryFee: 0,
          total: 30000,
          fulfillmentStatus: 'completed',
          paymentStatus: 'paid',
          paymentId: 'payment-1',
          source: 'TikTok',
        },
        {
          id: 'refunded-order',
          customer: { name: 'Refunded Customer', phone: '093333333', city: 'Bago', address: '' },
          items: [
            {
              id: 'line-3',
              type: 'Skirt',
              size: 'Size 1',
              color: 'Blue',
              quantity: 1,
              unitPrice: 20000,
              unitCost: 12000,
              discount: 0,
              lineTotal: 20000,
              allocations: [],
            },
          ],
          date: '2026-06-21',
          subtotal: 20000,
          discount: 0,
          deliveryFee: 0,
          total: 20000,
          fulfillmentStatus: 'completed',
          paymentStatus: 'refunded',
          paymentId: 'payment-2',
          refundId: 'refund-1',
          source: 'Messenger',
        },
      ],
    },
  }),
}))

vi.mock('../contexts/FeedbackContext.jsx', () => ({
  useFeedback: () => ({ notify: vi.fn() }),
}))

vi.mock('../hooks/useSessionState.js', () => ({
  default: (_key, initialValue) => [initialValue, vi.fn()],
}))

import FinancePage from './FinancePage.jsx'

describe('Finance reconciliation UI', () => {
  beforeEach(() => {
    responsive.mobile = false
  })

  it('shows all finance order states by default with the correct actions', () => {
    const html = renderToStaticMarkup(<FinancePage refresh={vi.fn()} />)

    expect(html).toContain('Outstanding Customer')
    expect(html).toContain('Paid Customer')
    expect(html).toContain('Refunded Customer')
    expect(html).toContain('All (3)')
    expect(html).toContain('Outstanding (1)')
    expect(html).toContain('Received (1)')
    expect(html).toContain('Refunded (1)')
    expect(html).toContain('45,000 Ks')
    expect(html).toContain('Receive')
    expect(html).toContain('Refund')
    expect(html).toContain('KBZ Pay 1 · 123456')
    expect(html).toContain('COD 112233 · TX 445566')
  })

  it('uses cards and a compact status selector instead of the table on mobile', () => {
    responsive.mobile = true
    const html = renderToStaticMarkup(<FinancePage refresh={vi.fn()} />)

    expect(html).toContain('finance-mobile-card')
    expect(html).toContain('Payment status')
    expect(html).toContain('All (3)')
    expect(html).not.toContain('finance-table')
  })
})
