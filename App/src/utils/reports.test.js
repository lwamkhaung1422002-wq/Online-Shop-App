import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { printOrderReceipt } from './reports.js'

describe('receipt printing', () => {
  let printedHtml

  beforeEach(() => {
    printedHtml = ''
    vi.stubGlobal('document', {
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => ({
        id: '',
        innerHTML: '',
        remove: vi.fn(),
      })),
      body: {
        appendChild: vi.fn((element) => {
          printedHtml = element.innerHTML
        }),
      },
    })
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      print: vi.fn(),
      setTimeout: vi.fn((callback) => {
        callback()
        return 1
      }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prints advance payment as the line deduction label', () => {
    printOrderReceipt({
      id: 'order-1',
      customer: { name: 'Customer', phone: '091234567', city: 'Yangon', address: 'Street' },
      date: '2026-06-22',
      items: [
        {
          id: 'item-1',
          type: 'Dress',
          size: 'Size 1',
          color: 'Black',
          quantity: 1,
          unitPrice: 25000,
          unitCost: 15000,
          discount: 5000,
          deductionType: 'advance-payment',
          lineTotal: 20000,
          allocations: [],
        },
      ],
      subtotal: 20000,
      discount: 0,
      deliveryFee: 0,
      total: 20000,
      fulfillmentStatus: 'reserved',
      paymentStatus: 'unpaid',
      source: 'Telegram',
      remark: '',
    })

    expect(printedHtml).toContain('Deduction')
    expect(printedHtml).toContain('Advance Payment: 5,000 Ks')
    expect(window.print).toHaveBeenCalled()
  })
})
