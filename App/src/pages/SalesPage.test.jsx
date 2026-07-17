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
  useAuth: () => ({ user: { uid: 'owner-1' } }),
}))

vi.mock('../contexts/DataContext.jsx', () => ({
  useData: () => ({
    data: {
      stocks: [],
      orders: [
        {
          id: 'order-123456789',
          customer: {
            name: 'Mobile Customer',
            phone: '09123456789',
            city: 'Yangon',
            address: 'Sample address',
          },
          date: '2026-06-22',
          items: [
            {
              id: 'item-1',
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
          fulfillmentStatus: 'reserved',
          paymentStatus: 'unpaid',
          source: 'Telegram',
          remark: '',
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

import SalesPage from './SalesPage.jsx'

describe('Sales responsive rendering', () => {
  beforeEach(() => {
    responsive.mobile = false
  })

  it('renders order cards and no table on mobile', () => {
    responsive.mobile = true
    const html = renderToStaticMarkup(<SalesPage navigate={vi.fn()} />)

    expect(html).toContain('mobile-order-card')
    expect(html).toContain('Mobile Customer')
    expect(html).toContain('Details')
    expect(html).toContain('Unpaid 1')
    expect(html).toContain('More actions for order order-123456789')
    expect(html).not.toContain('<table')
  })

  it('renders the compact order table and no cards on desktop', () => {
    responsive.mobile = false
    const html = renderToStaticMarkup(<SalesPage navigate={vi.fn()} />)

    expect(html).toContain('desktop-order-table')
    expect(html).toContain('<table')
    expect(html).toContain('All 1')
    expect(html).toContain('aria-label="View order details"')
    expect(html).toContain('aria-label="Print receipt"')
    expect(html).not.toContain('mobile-order-card')
  })
})
