import { formatKs } from './storage.js'
import {
  deductionLabel,
  getOrderQuantity,
  normalizeOrder,
  normalizeOrders,
} from '../domain/orders.js'

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function table(headers, rows) {
  return `
    <table class="print-table">
      <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows
          .map(
            (row) =>
              `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`,
          )
          .join('')}
      </tbody>
    </table>
  `
}

function reportShell(title, body, meta = '') {
  const brand = document.title && document.title !== 'Vite + React' ? document.title : 'Shop Owner'
  return `
    <section class="print-document">
      <header class="print-header">
        <div>
          <div class="print-brand">${escapeHtml(brand)}</div>
          <h1>${escapeHtml(title)}</h1>
          ${meta ? `<p>${escapeHtml(meta)}</p>` : ''}
        </div>
        <div class="print-date">${escapeHtml(new Date().toLocaleString())}</div>
      </header>
      ${body}
      <footer class="print-footer">${escapeHtml(brand)} POS - Generated report</footer>
    </section>
  `
}

function printHtml(html) {
  document.getElementById('print-root')?.remove()
  const root = document.createElement('div')
  root.id = 'print-root'
  root.innerHTML = html
  document.body.appendChild(root)

  const cleanup = () => {
    root.remove()
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.setTimeout(() => window.print(), 80)
  window.setTimeout(cleanup, 60_000)
}

export function printSalesReport(rawOrders) {
  const orders = normalizeOrders(rawOrders)
  if (!orders.length) throw new Error('There are no orders to print.')

  const rows = orders.flatMap((order) =>
    order.items.map((item, itemIndex) => [
      itemIndex === 0 ? order.date : '',
      itemIndex === 0 ? order.customer.name : '',
      itemIndex === 0 ? order.customer.phone : '',
      item.type,
      item.size,
      item.color,
      item.quantity,
      formatKs(item.unitPrice),
      formatKs(item.lineTotal),
      itemIndex === 0 ? order.fulfillmentStatus : '',
      itemIndex === 0 ? order.paymentStatus : '',
    ]),
  )
  const quantity = orders.reduce((sum, order) => sum + getOrderQuantity(order), 0)
  const total = orders.reduce((sum, order) => sum + order.total, 0)

  printHtml(
    reportShell(
      'Sales Orders Report',
      `${table(
        [
          'Date',
          'Customer',
          'Phone',
          'Product',
          'Size',
          'Color',
          'Qty',
          'Unit price',
          'Line total',
          'Fulfillment',
          'Payment',
        ],
        rows,
      )}
      <div class="print-totals">
        <strong>Total orders: ${orders.length}</strong>
        <strong>Total items: ${quantity}</strong>
        <strong>Total value: ${escapeHtml(formatKs(total))}</strong>
      </div>`,
    ),
  )
}

export function printOrderReceipt(rawOrder) {
  const order = normalizeOrder(rawOrder)
  const itemRows = order.items.map((item) => [
    item.type,
    `${item.size} / ${item.color}`,
    item.quantity,
    formatKs(item.unitPrice),
    item.discount ? `${deductionLabel(item.deductionType)}: ${formatKs(item.discount)}` : '-',
    formatKs(item.lineTotal),
  ])

  printHtml(
    reportShell(
      'Order Receipt',
      `
        <div class="print-info-grid">
          <div><span>Order ID</span><strong>${escapeHtml(order.id)}</strong></div>
          <div><span>Date</span><strong>${escapeHtml(order.date)}</strong></div>
          <div><span>Customer</span><strong>${escapeHtml(order.customer.name)}</strong></div>
          <div><span>Phone</span><strong>${escapeHtml(order.customer.phone)}</strong></div>
          <div class="print-wide"><span>Address</span><strong>${escapeHtml(
            [order.customer.address, order.customer.city].filter(Boolean).join(', ') || '-',
          )}</strong></div>
        </div>
        ${table(
          ['Product', 'Variant', 'Qty', 'Unit price', 'Deduction', 'Total'],
          itemRows,
        )}
        <div class="receipt-summary">
          <div><span>Subtotal</span><strong>${escapeHtml(formatKs(order.subtotal))}</strong></div>
          <div><span>Discount</span><strong>${escapeHtml(formatKs(order.discount))}</strong></div>
          <div><span>Delivery fee</span><strong>${escapeHtml(
            formatKs(order.deliveryFee),
          )}</strong></div>
          <div class="receipt-grand-total"><span>Total</span><strong>${escapeHtml(
            formatKs(order.total),
          )}</strong></div>
        </div>
        ${order.remark ? `<p class="print-note"><strong>Remark:</strong> ${escapeHtml(order.remark)}</p>` : ''}
      `,
      `${order.fulfillmentStatus} Â· ${order.paymentStatus}`,
    ),
  )
}

export function printStockReport(rows, totals) {
  printHtml(
    reportShell(
      'Stock Report',
      `${table(
        [
          'Date',
          'Product',
          'Size',
          'Color',
          'Cost',
          'Sale price',
          'Stock',
          'Reserved/Sold',
          'Available',
          'Delivery',
        ],
        rows.map((row) => [
          row.date,
          row.type,
          row.size,
          row.color,
          formatKs(row.unitCost ?? row.price),
          formatKs(row.salePrice ?? row.price),
          row.adjustedQty,
          row.sold,
          row.available,
          formatKs(row.deli),
        ]),
      )}
      <div class="print-totals">
        <strong>Total stock: ${totals.totalQuantity}</strong>
        <strong>Available: ${totals.totalAvailable}</strong>
        <strong>Stock value: ${escapeHtml(formatKs(totals.totalValue))}</strong>
      </div>`,
    ),
  )
}

export function printBalanceReport(incomeMap, summary = null) {
  const total = Object.values(incomeMap).reduce((sum, value) => sum + value, 0)
  const financialRows = summary
    ? [
        ['Revenue', formatKs(summary.revenue)],
        ['Cost of goods sold', formatKs(summary.costOfGoods)],
        ['Gross profit', formatKs(summary.grossProfit)],
        ['Operating expenses', formatKs(summary.operatingExpenses)],
        ['Net profit', formatKs(summary.netProfit)],
      ]
    : []

  printHtml(
    reportShell(
      'Balance and Profit Report',
      `${table(
        ['Payment method', 'Received amount'],
        Object.entries(incomeMap).map(([method, value]) => [method, formatKs(value)]),
      )}
      <h2>Financial summary</h2>
      ${summary ? table(['Metric', 'Amount'], financialRows) : ''}
      <div class="print-totals"><strong>Current received balance: ${escapeHtml(
        formatKs(total),
      )}</strong></div>`,
    ),
  )
}

export function printExpenseReport(expenses) {
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  printHtml(
    reportShell(
      'Expense Report',
      `${table(
        ['Date', 'Title', 'Type', 'Method', 'Amount', 'Note'],
        expenses.map((expense) => [
          expense.date,
          expense.title,
          expense.type,
          expense.method,
          formatKs(expense.amount),
          expense.note || '-',
        ]),
      )}
      <div class="print-totals"><strong>Total expenses: ${escapeHtml(
        formatKs(total),
      )}</strong></div>`,
    ),
  )
}

// Compatibility aliases while remaining screens are migrated.
export const exportSalesPDF = printSalesReport
export const exportStockPDF = printStockReport
export const exportBalancePDF = printBalanceReport
export const exportExpensePDF = printExpenseReport
