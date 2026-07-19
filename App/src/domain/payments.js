import { normalizeOrders } from './orders.js'
import { activePaymentMethods, isCodPaymentMethod } from '../utils/catalog.js'

export const PAYMENT_METHODS = ['COD', 'Cash', 'Other']

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 6)
}

export function paymentReference(details) {
  return details.isCod || details.method === 'COD' ? details.billNumber : details.transactionId
}

export function paymentReferences(details) {
  if (details.isCod || details.method === 'COD') {
    return [
      { kind: 'bill', field: 'billNumber', value: String(details.billNumber || '') },
      { kind: 'transaction', field: 'transactionId', value: String(details.transactionId || '') },
    ]
  }
  return [
    { kind: 'transaction', field: 'transactionId', value: String(details.transactionId || '') },
  ]
}

export function validatePaymentDetails(details) {
  const methods = details.settings ? activePaymentMethods(details.settings).map((method) => method.name) : PAYMENT_METHODS
  const isCod = details.isCod ?? isCodPaymentMethod(details.method, details.settings || {})
  if (!methods.includes(details.method)) return 'Choose a valid payment method.'
  if (!details.date) return 'Payment date is required.'
  if (isCod && !/^\d{6}$/.test(String(details.billNumber || ''))) {
    return 'COD reference must be exactly 6 digits.'
  }
  if (!/^\d{6}$/.test(String(details.transactionId || ''))) {
    return 'Transaction ID must be exactly 6 digits.'
  }
  return ''
}

export function validateCodSettlement(allocations, details) {
  const paymentError = validatePaymentDetails({ ...details, isCod: true })
  if (paymentError) return paymentError
  if (!Array.isArray(allocations) || allocations.length < 1) {
    return 'Select at least one outstanding order.'
  }
  if (allocations.length > 100) return 'A COD settlement can contain at most 100 orders.'
  if (new Set(allocations.map((item) => item.orderId)).size !== allocations.length) {
    return 'An order cannot be selected more than once.'
  }
  if (allocations.some((item) => !String(item.phone || '').trim())) {
    return 'Every selected order must have a customer phone number.'
  }
  const allocationTotal = allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const normalizedAllocationTotal = Math.round(allocationTotal * 100) / 100
  const normalizedTransferredTotal = Math.round(Number(details.amount || 0) * 100) / 100
  if (normalizedAllocationTotal !== normalizedTransferredTotal) {
    return 'Transferred total must equal the selected order total.'
  }
  return ''
}

export function paymentReferenceKey(details, reference = paymentReferences(details)[0]) {
  const method = String(details.method || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const kind = details.isCod || details.method === 'COD' ? `-${reference.kind}` : ''
  return `${method}${kind}__${reference.value}`
}

export function buildPaymentReconciliation(source = {}) {
  const orders = normalizeOrders(source.orders || [])
  const payments = source.payments || []
  const orderById = Object.fromEntries(orders.map((order) => [order.id, order]))
  const paymentById = Object.fromEntries(payments.map((payment) => [String(payment.id), payment]))
  const activeOrders = orders.filter((order) => order.fulfillmentStatus !== 'cancelled')
  const outstandingOrders = activeOrders.filter((order) => order.paymentStatus === 'unpaid')
  const receivedOrders = activeOrders.filter((order) => order.paymentStatus === 'paid')
  const refundedOrders = activeOrders.filter((order) => order.paymentStatus === 'refunded')
  const anomalies = []
  const seenReferences = new Map()

  receivedOrders.forEach((order) => {
    if (!order.paymentId || !paymentById[order.paymentId]) {
      anomalies.push({ type: 'missing-payment', orderId: order.id })
    }
  })
  refundedOrders.forEach((order) => {
    if (!order.refundId || !paymentById[order.refundId]) {
      anomalies.push({ type: 'missing-refund', orderId: order.id })
    }
  })
  payments.forEach((payment) => {
    const linkedOrderIds = payment.orderIds?.length
      ? payment.orderIds.map(String)
      : payment.orderId
        ? [String(payment.orderId)]
        : []
    if (!linkedOrderIds.length || linkedOrderIds.every((orderId) => !orderById[orderId])) {
      anomalies.push({ type: 'orphan-payment', paymentId: String(payment.id) })
    }
    if (!payment.method) return
    paymentReferences(payment).forEach((reference) => {
      if (!reference.value) return
      const key = paymentReferenceKey(payment, reference)
      if (seenReferences.has(key)) {
        anomalies.push({
          type: 'duplicate-reference',
          referenceKind: reference.kind,
          paymentId: String(payment.id),
          otherPaymentId: seenReferences.get(key),
        })
      } else {
        seenReferences.set(key, String(payment.id))
      }
    })
  })

  const sum = (list) => list.reduce((total, order) => total + Number(order.total || 0), 0)
  return {
    orders,
    payments,
    orderById,
    paymentById,
    settlementByOrderId: Object.fromEntries(
      payments.flatMap((payment) =>
        (payment.orderIds || []).map((orderId) => [String(orderId), payment]),
      ),
    ),
    outstandingOrders,
    receivedOrders,
    refundedOrders,
    cancelledOrders: orders.filter((order) => order.fulfillmentStatus === 'cancelled'),
    anomalies,
    totals: {
      outstanding: sum(outstandingOrders),
      received: sum(receivedOrders),
      refunded: sum(refundedOrders),
    },
  }
}

export function filterFinanceOrders(state, search = '', searchType = 'all', status = 'all') {
  const term = String(search || '').trim().toLowerCase()
  const searched = [
    ...state.outstandingOrders,
    ...state.receivedOrders,
    ...state.refundedOrders,
  ]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .filter((order) => {
      const payment = state.paymentById[order.paymentId] || {}
      const values = {
        id: order.id,
        name: order.customer.name,
        phone: order.customer.phone,
        tx: payment.transactionId,
        bill: payment.billNumber,
        method: payment.method,
      }
      if (!term) return true
      if (searchType === 'all') {
        return Object.values(values).some((value) =>
          String(value || '').toLowerCase().includes(term),
        )
      }
      return String(values[searchType] || '').toLowerCase().includes(term)
    })
  const counts = {
    all: searched.length,
    outstanding: searched.filter((order) => order.paymentStatus === 'unpaid').length,
    received: searched.filter((order) => order.paymentStatus === 'paid').length,
    refunded: searched.filter((order) => order.paymentStatus === 'refunded').length,
  }
  const paymentStatus = { outstanding: 'unpaid', received: 'paid', refunded: 'refunded' }[status]
  return {
    counts,
    orders: status === 'all' ? searched : searched.filter((order) => order.paymentStatus === paymentStatus),
  }
}
