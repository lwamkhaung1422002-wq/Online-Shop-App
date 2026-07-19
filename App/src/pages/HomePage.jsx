import { useMemo } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import ShoppingBagRoundedIcon from '@mui/icons-material/ShoppingBagRounded'
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded'
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded'
import AddBusinessRoundedIcon from '@mui/icons-material/AddBusinessRounded'
import PaidRoundedIcon from '@mui/icons-material/PaidRounded'
import PostAddRoundedIcon from '@mui/icons-material/PostAddRounded'
import MetricCard from '../components/MetricCard.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { useData } from '../contexts/DataContext.jsx'
import {
  buildAppState,
  formatKs,
  getReceivedByMethod,
  getToday,
  getVariantKey,
} from '../utils/storage.js'
import { calculateFinancialSummary } from '../domain/finance.js'
import { normalizeOrders } from '../domain/orders.js'
import useSessionState from '../hooks/useSessionState.js'

function buildSalesSummary(orders, from, to) {
  const list = normalizeOrders(orders).filter(
    (order) =>
      (!from || order.date >= from) &&
      (!to || order.date <= to) &&
      !['preorder', 'cancelled'].includes(order.fulfillmentStatus),
  )
  const grouped = {}

  list.forEach((order) => {
    order.items.forEach((item) => {
      const key = `${order.date}_${item.size}_${item.color}_${item.type || '-'}`
      grouped[key] ??= {
        date: order.date,
        type: item.type,
        size: item.size,
        color: item.color,
        price: item.unitPrice,
        quantity: 0,
        amount: 0,
      }
      grouped[key].quantity += Number(item.quantity || 0)
      grouped[key].amount += Number(item.lineTotal || 0)
    })
  })

  const rows = Object.values(grouped)
  return {
    rows,
    totalQty: rows.reduce((sum, row) => sum + row.quantity, 0),
    totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
    totalOrders: list.length,
  }
}

function buildStockOverview(appState) {
  const stockMap = {}

  appState.stocks.forEach((stock) => {
    const key = getVariantKey(stock.size, stock.color, stock.type)
    stockMap[key] ??= {
      size: stock.size,
      color: stock.color,
      type: stock.type || '-',
      total: 0,
    }
    stockMap[key].total += Number(stock.quantity || 0)
  })

  const items = Object.values(stockMap).map((item) => {
    const reserved = appState.soldByVariant[getVariantKey(item.size, item.color, item.type)] || 0
    const available = Math.max(0, item.total - reserved)
    return {
      ...item,
      available,
      status: available <= 0 ? 'out' : available <= 3 ? 'low' : 'good',
    }
  })

  return {
    items,
    totalAvailable: items.reduce((sum, item) => sum + item.available, 0),
    alerts: items
      .filter((item) => item.status !== 'good')
      .sort((a, b) => a.available - b.available),
  }
}

function getBalanceByMethod(appState) {
  return getReceivedByMethod(appState.payments, appState.orderById)
}

function daysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function HomePage({ navigate }) {
  const { data } = useData()
  const [filters, setFilters] = useSessionState('home:filters', {
    from: daysAgo(30),
    to: getToday(),
  })
  const [details, setDetails] = useSessionState('home:details', {
    finance: false,
  })

  const appState = useMemo(() => buildAppState(data), [data])
  const stockOverview = useMemo(() => buildStockOverview(appState), [appState])
  const salesSummary = useMemo(
    () => buildSalesSummary(appState.orders, filters.from, filters.to),
    [appState.orders, filters.from, filters.to],
  )
  const methodBalance = useMemo(() => getBalanceByMethod(appState), [appState])
  const financialSummary = useMemo(
    () => calculateFinancialSummary(appState.orders, data.expenses),
    [appState.orders, data.expenses],
  )

  const activeOrders = normalizeOrders(appState.orders).filter(
    (order) => !['preorder', 'cancelled'].includes(order.fulfillmentStatus),
  )
  const totalSaleValue = activeOrders.reduce((sum, order) => sum + order.total, 0)
  const totalBalance = Object.values(methodBalance).reduce((sum, value) => sum + value, 0)
  const cashReceived = totalBalance
  const outstanding = Math.max(0, totalSaleValue - cashReceived)

  return (
    <Box className="page-stack home-dashboard">
      <PageHeader title="Home" subtitle="Shop activity at a glance" />

      <Box className="home-primary-metrics">
        <MetricCard
          title="Sales"
          value={formatKs(salesSummary.totalAmount)}
          tone="primary"
          icon={<ReceiptLongRoundedIcon />}
        />
        <MetricCard
          title="Cash Received"
          value={formatKs(cashReceived)}
          tone="success"
          icon={<AccountBalanceWalletRoundedIcon />}
        />
        <MetricCard
          title="Outstanding"
          value={formatKs(outstanding)}
          tone={outstanding ? 'error' : 'default'}
          icon={<ShoppingBagRoundedIcon />}
        />
        <MetricCard
          title="Low Stock"
          value={stockOverview.alerts.length}
          tone={stockOverview.alerts.length ? 'warning' : 'success'}
          icon={<Inventory2RoundedIcon />}
        />
      </Box>

      <Paper variant="outlined" className="section-card home-quick-actions">
        <Typography variant="h6">Quick actions</Typography>
        <Box className="quick-action-grid">
          <Button
            variant="contained"
            startIcon={<AddShoppingCartRoundedIcon />}
            onClick={() => navigate('order')}
          >
            New Order
          </Button>
          <Button
            variant="outlined"
            startIcon={<AddBusinessRoundedIcon />}
            onClick={() => navigate('stock')}
          >
            Add Stock
          </Button>
          <Button
            variant="outlined"
            startIcon={<PaidRoundedIcon />}
            onClick={() => navigate('finance')}
          >
            Receive Payment
          </Button>
          <Button
            variant="outlined"
            startIcon={<PostAddRoundedIcon />}
            onClick={() => navigate('balance')}
          >
            Add Expense
          </Button>
        </Box>
      </Paper>

      <Box className="home-main-grid">
        <Paper variant="outlined" className="section-card home-stock-alerts">
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="h6">Stock alerts</Typography>
              <Typography variant="body2" color="text.secondary">
                Products requiring attention
              </Typography>
            </Box>
            <Button onClick={() => navigate('stock')}>Open stock</Button>
          </Stack>
          <Stack spacing={1} sx={{ mt: 2 }}>
            {stockOverview.alerts.slice(0, 6).map((item) => (
              <Alert
                key={`${item.type}-${item.size}-${item.color}`}
                severity={item.status === 'out' ? 'error' : 'warning'}
                variant="outlined"
              >
                <strong>{item.type}</strong> · {item.size} · {item.color}: {item.available} available
              </Alert>
            ))}
            {!stockOverview.alerts.length ? (
              <Box className="empty-state compact">
                <Typography fontWeight={800}>Stock levels look healthy</Typography>
                <Typography variant="body2" color="text.secondary">
                  No low or out-of-stock products.
                </Typography>
              </Box>
            ) : null}
          </Stack>
        </Paper>

        <Paper variant="outlined" className="section-card home-finance-summary">
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="h6">Financial summary</Typography>
              <Typography variant="body2" color="text.secondary">
                Received balance and profitability
              </Typography>
            </Box>
            <Button
              onClick={() =>
                setDetails((current) => ({ ...current, finance: !current.finance }))
              }
            >
              {details.finance ? 'Hide' : 'Details'}
            </Button>
          </Stack>
          <Stack spacing={1.25} sx={{ mt: 2 }}>
            <SummaryRow label="Current Balance" value={formatKs(totalBalance)} tone="success.main" />
            <SummaryRow label="Gross Profit" value={formatKs(financialSummary.grossProfit)} />
            <SummaryRow
              label="Net Profit"
              value={formatKs(financialSummary.netProfit)}
              tone={financialSummary.netProfit >= 0 ? 'success.main' : 'error.main'}
            />
          </Stack>
          <Collapse in={details.finance}>
            <Box className="balance-method-grid" sx={{ mt: 2 }}>
              {Object.entries(methodBalance).map(([method, amount]) => (
                <Card key={method} variant="outlined">
                  <CardContent>
                    <Typography variant="caption" color="text.secondary">
                      {method}
                    </Typography>
                    <Typography fontWeight={900}>{formatKs(amount)}</Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Collapse>
        </Paper>
      </Box>

      <Paper variant="outlined" className="section-card home-sales-section">
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          gap={2}
          sx={{ alignItems: { md: 'center' } }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6">Sales activity</Typography>
            <Typography variant="body2" color="text.secondary">
              Product totals for the selected date range
            </Typography>
          </Box>
          <TextField
            type="date"
            label="From"
            value={filters.from}
            onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
            size="small"
          />
          <TextField
            type="date"
            label="To"
            value={filters.to}
            onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
            size="small"
          />
        </Stack>

        <Box className="home-secondary-metrics">
          <MetricCard title="Items" value={salesSummary.totalQty} />
          <MetricCard title="Orders" value={salesSummary.totalOrders} />
          <MetricCard title="Amount" value={formatKs(salesSummary.totalAmount)} tone="primary" />
          <MetricCard title="Available Stock" value={stockOverview.totalAvailable} tone="success" />
        </Box>

        <Box className="home-sales-cards">
          {salesSummary.rows.map((row) => (
            <Card key={`${row.date}-${row.type}-${row.size}-${row.color}`} variant="outlined">
              <CardContent>
                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Box>
                    <Typography fontWeight={900}>{row.type}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {row.size} · {row.color}
                    </Typography>
                  </Box>
                  <Chip label={`${row.quantity} items`} size="small" color="primary" />
                </Stack>
                <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 2 }}>
                  <Typography variant="body2">{row.date}</Typography>
                  <Typography fontWeight={900}>{formatKs(row.amount)}</Typography>
                </Stack>
              </CardContent>
            </Card>
          ))}
          {!salesSummary.rows.length ? (
            <Box className="empty-state compact">
              <Typography fontWeight={800}>No sales in this range</Typography>
              <Typography variant="body2" color="text.secondary">
                Choose another date range or create a new order.
              </Typography>
            </Box>
          ) : null}
        </Box>

        <TableContainer className="home-sales-table">
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Product</TableCell>
                <TableCell>Variant</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {salesSummary.rows.map((row) => (
                <TableRow key={`${row.date}-${row.type}-${row.size}-${row.color}`} hover>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>{row.type || '-'}</TableCell>
                  <TableCell>{row.size} · {row.color}</TableCell>
                  <TableCell align="right">{row.quantity}</TableCell>
                  <TableCell align="right">{formatKs(row.price)}</TableCell>
                  <TableCell align="right">{formatKs(row.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  )
}

function SummaryRow({ label, value, tone = 'text.primary' }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography fontWeight={900} color={tone}>
        {value}
      </Typography>
    </Stack>
  )
}
