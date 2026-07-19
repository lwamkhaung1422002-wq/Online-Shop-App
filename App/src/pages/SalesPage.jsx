import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material'
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded'
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded'
import PrintRoundedIcon from '@mui/icons-material/PrintRounded'
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import PageHeader from '../components/PageHeader.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useData } from '../contexts/DataContext.jsx'
import { useFeedback } from '../contexts/FeedbackContext.jsx'
import {
  cancelOrderAtomic,
  fulfillPreorderAtomic,
  setOrderFulfillmentStatus,
} from '../services/shopApiService.js'
import { formatKs } from '../utils/storage.js'
import {
  deductionLabel,
  getOrderQuantity,
  normalizeOrders,
  orderSearchText,
} from '../domain/orders.js'
import useSessionState from '../hooks/useSessionState.js'
import { normalizeCatalogSettings } from '../utils/catalog.js'

const filters = ['all', 'reserved', 'completed', 'paid', 'unpaid', 'refunded', 'preorder', 'cancelled']
const filterLabel = (value) => value[0].toUpperCase() + value.slice(1)

function statusColor(status) {
  if (status === 'completed') return 'success'
  if (status === 'preorder') return 'warning'
  if (status === 'cancelled') return 'error'
  return 'primary'
}

function ItemsSummary({ order }) {
  return (
    <Stack spacing={0.25}>
      {order.items.slice(0, 2).map((item) => (
        <Typography key={item.id} variant="body2">
          {item.quantity}× {item.type} · {item.variantName || [item.size, item.color].filter(Boolean).join(' / ')}
        </Typography>
      ))}
      {order.items.length > 2 ? (
        <Typography variant="caption" color="text.secondary">
          +{order.items.length - 2} more item line(s)
        </Typography>
      ) : null}
    </Stack>
  )
}

export default function SalesPage({ navigate }) {
  const mobile = useMediaQuery('(max-width:767px)')
  const { user } = useAuth()
  const { data } = useData()
  const { notify } = useFeedback()
  const catalog = useMemo(() => normalizeCatalogSettings(data.catalogSettings), [data.catalogSettings])
  const [view, setView] = useSessionState('sales:view', {
    filter: 'all',
    search: '',
    from: '',
    to: '',
    source: '',
  })
  const { filter, search, from, to, source } = view
  const setFilter = (value) => setView((current) => ({ ...current, filter: value }))
  const setSearch = (value) => setView((current) => ({ ...current, search: value }))
  const setFrom = (value) => setView((current) => ({ ...current, from: value }))
  const setTo = (value) => setView((current) => ({ ...current, to: value }))
  const setSource = (value) => setView((current) => ({ ...current, source: value }))
  const [cancelTarget, setCancelTarget] = useState(null)
  const [detailsOrder, setDetailsOrder] = useState(null)
  const [workingId, setWorkingId] = useState('')

  const orders = useMemo(() => normalizeOrders(data.orders), [data.orders])
  const sources = useMemo(
    () => [...new Set(orders.map((order) => order.source).filter(Boolean))],
    [orders],
  )
  const filterCounts = useMemo(
    () =>
      Object.fromEntries(
        filters.map((item) => [
          item,
          item === 'all'
            ? orders.length
            : ['paid', 'unpaid', 'refunded'].includes(item)
              ? orders.filter((order) => order.paymentStatus === item).length
              : orders.filter((order) => order.fulfillmentStatus === item).length,
        ]),
      ),
    [orders],
  )
  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase()
    return orders
      .filter((order) => {
        if (['paid', 'unpaid', 'refunded'].includes(filter) && order.paymentStatus !== filter) {
          return false
        }
        if (
          !['all', 'paid', 'unpaid', 'refunded'].includes(filter) &&
          order.fulfillmentStatus !== filter
        ) {
          return false
        }
        if (from && order.date < from) return false
        if (to && order.date > to) return false
        if (source && order.source !== source) return false
        return !term || orderSearchText(order).includes(term)
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  }, [filter, from, orders, search, source, to])

  const totals = filteredOrders.reduce(
    (summary, order) => ({
      quantity: summary.quantity + getOrderQuantity(order),
      amount: summary.amount + order.total,
    }),
    { quantity: 0, amount: 0 },
  )

  const run = async (order, operation, successMessage) => {
    setWorkingId(order.id)
    try {
      await operation()
      notify(successMessage)
    } catch (error) {
      notify(error.message || 'The order could not be updated.', 'error')
    } finally {
      setWorkingId('')
    }
  }

  const toggleCompleted = (order) =>
    run(
      order,
      () =>
        setOrderFulfillmentStatus(
          user.uid,
          order.id,
          order.fulfillmentStatus === 'completed' ? 'reserved' : 'completed',
        ),
      'Fulfillment status updated.',
    )

  const fulfillPreorder = (order) =>
    run(
      order,
      () => fulfillPreorderAtomic(user.uid, order, data.stocks, data.orders),
      'Preorder is now reserved from available stock.',
    )

  const confirmCancel = async () => {
    const order = cancelTarget
    if (!order) return
    await run(
      order,
      () => cancelOrderAtomic(user.uid, order.id, 'Cancelled by shop owner'),
      'Order cancelled and reserved stock released.',
    )
    setCancelTarget(null)
  }

  const printSales = async () => {
    const { printSalesReport } = await import('../utils/reports.js')
    printSalesReport(filteredOrders, catalog)
  }

  const printReceipt = async (order) => {
    const { printOrderReceipt } = await import('../utils/reports.js')
    printOrderReceipt(order, catalog)
  }

  return (
    <Box className="page-stack">
      <PageHeader
        title="Orders"
        subtitle="Manage multi-item orders, fulfillment, payments, and receipts."
        actions={
          <>
            <Button variant="outlined" startIcon={<PictureAsPdfRoundedIcon />} onClick={printSales}>
              Print report
            </Button>
            <Button
              variant="contained"
              startIcon={<AddShoppingCartRoundedIcon />}
              onClick={() => navigate('order')}
            >
              New order
            </Button>
          </>
        }
      />

      <Paper variant="outlined" className="section-card">
        <Box className="form-grid">
          <TextField
            className="span-6"
            label="Search customer, phone, item, or order ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            size="small"
          />
          <TextField
            className="span-2"
            type="date"
            label="From"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            size="small"
          />
          <TextField
            className="span-2"
            type="date"
            label="To"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            size="small"
          />
          <FormControl className="span-2" size="small">
            <InputLabel>Source</InputLabel>
            <Select label="Source" value={source} onChange={(event) => setSource(event.target.value)}>
              <MenuItem value="">All</MenuItem>
              {sources.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Stack direction="row" gap={0.75} sx={{ mt: 2, flexWrap: 'wrap' }}>
          {['all', 'paid', 'unpaid', 'refunded', 'preorder', 'cancelled'].map((item) => (
            <Chip
              key={item}
              size="small"
              variant={filter === item ? 'filled' : 'outlined'}
              color={filter === item ? 'primary' : 'default'}
              label={`${filterLabel(item)} ${filterCounts[item]}`}
              onClick={() => setFilter(item)}
            />
          ))}
        </Stack>
        {mobile ? (
          <FormControl fullWidth size="small" sx={{ mt: 2 }}>
            <InputLabel>Status</InputLabel>
            <Select label="Status" value={filter} onChange={(event) => setFilter(event.target.value)}>
              {filters.map((item) => (
                <MenuItem key={item} value={item}>
                  {filterLabel(item)} ({filterCounts[item]})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <Box sx={{ mt: 2, overflowX: 'auto' }}>
            <ToggleButtonGroup
              value={filter}
              exclusive
              size="small"
              onChange={(_, value) => value && setFilter(value)}
            >
              {filters.map((item) => (
                <ToggleButton key={item} value={item}>
                  {filterLabel(item)} ({filterCounts[item]})
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        )}
      </Paper>

      {mobile ? (
        <Box className="mobile-order-list">
          {filteredOrders.map((order) => (
            <MobileOrderCard
              key={order.id}
              order={order}
              busy={workingId === order.id}
              onPrint={() => printReceipt(order)}
              onToggle={() => toggleCompleted(order)}
              onFulfill={() => fulfillPreorder(order)}
              onCancel={() => setCancelTarget(order)}
              onView={() => setDetailsOrder(order)}
            />
          ))}
          {!filteredOrders.length ? (
            <Paper variant="outlined" className="empty-state">
              <Typography fontWeight={700}>No matching orders</Typography>
              <Typography variant="body2" color="text.secondary">
                Adjust the filters or create a new order.
              </Typography>
            </Paper>
          ) : null}
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" className="desktop-order-table">
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Date / ID</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Items</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Fulfillment</TableCell>
                <TableCell>Payment</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredOrders.map((order) => (
                <TableRow key={order.id} hover>
                  <TableCell>
                    <Typography variant="body2">{order.date}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {order.id.slice(0, 10)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={700}>{order.customer.name}</Typography>
                    <Typography variant="caption">{order.customer.phone}</Typography>
                  </TableCell>
                  <TableCell>
                    <ItemsSummary order={order} />
                  </TableCell>
                  <TableCell align="right">{getOrderQuantity(order)}</TableCell>
                  <TableCell align="right">{formatKs(order.total)}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={statusColor(order.fulfillmentStatus)}
                      label={order.fulfillmentStatus}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={order.paymentStatus === 'paid' ? 'success' : 'default'}
                      label={order.paymentStatus}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <DesktopOrderActions
                      order={order}
                      busy={workingId === order.id}
                      onPrint={() => printReceipt(order)}
                      onToggle={() => toggleCompleted(order)}
                      onFulfill={() => fulfillPreorder(order)}
                      onCancel={() => setCancelTarget(order)}
                      onView={() => setDetailsOrder(order)}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {!filteredOrders.length ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Box className="empty-state">
                      <Typography fontWeight={700}>No matching orders</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Adjust the search or create a new order.
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Paper variant="outlined" className="section-card">
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          gap={1}
          sx={{ justifyContent: 'space-between' }}
        >
          <Typography>
            <strong>{filteredOrders.length}</strong> orders - <strong>{totals.quantity}</strong> items
          </Typography>
          <Typography fontWeight={900}>Total: {formatKs(totals.amount)}</Typography>
        </Stack>
      </Paper>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel order?"
        message="The order will remain in the audit history and its reserved stock will be released. Paid orders must be refunded first."
        confirmLabel="Cancel order"
        busy={Boolean(cancelTarget && workingId === cancelTarget.id)}
        onCancel={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
      />

      <OrderDetailsDrawer
        order={detailsOrder}
        mobile={mobile}
        onClose={() => setDetailsOrder(null)}
        onPrint={() => detailsOrder && printReceipt(detailsOrder)}
      />
    </Box>
  )
}

function MobileOrderCard({ order, busy, onPrint, onToggle, onFulfill, onCancel, onView }) {
  const [menuAnchor, setMenuAnchor] = useState(null)
  const active = order.fulfillmentStatus !== 'cancelled'
  const preorder = order.fulfillmentStatus === 'preorder'

  return (
    <Paper variant="outlined" className="mobile-order-card">
      <Stack direction="row" gap={2} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography fontWeight={900} noWrap>
            {order.customer.name || 'Unnamed customer'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {order.date} - {order.customer.phone || 'No phone'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            #{order.id.slice(0, 10)}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography fontWeight={900} color="primary.main">
            {formatKs(order.total)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {getOrderQuantity(order)} item(s)
          </Typography>
        </Box>
      </Stack>

      <Box className="mobile-order-items">
        <ItemsSummary order={order} />
      </Box>

      <Stack direction="row" gap={0.75} sx={{ flexWrap: 'wrap' }}>
        <Chip
          size="small"
          color={statusColor(order.fulfillmentStatus)}
          label={order.fulfillmentStatus}
        />
        <Chip
          size="small"
          variant="outlined"
          color={order.paymentStatus === 'paid' ? 'success' : 'default'}
          label={order.paymentStatus}
        />
        {order.source ? <Chip size="small" variant="outlined" label={order.source} /> : null}
      </Stack>

      <Divider />

      <Stack direction="row" gap={1} sx={{ alignItems: 'center' }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<VisibilityOutlinedIcon />}
          onClick={onView}
        >
          Details
        </Button>
        {preorder ? (
          <Button
            size="small"
            color="success"
            variant="contained"
            startIcon={<CheckCircleRoundedIcon />}
            onClick={onFulfill}
            disabled={busy}
            sx={{ flex: 1 }}
          >
            Reserve stock
          </Button>
        ) : active ? (
          <Button
            size="small"
            variant={order.fulfillmentStatus === 'completed' ? 'outlined' : 'contained'}
            startIcon={
              order.fulfillmentStatus === 'completed' ? <ReplayRoundedIcon /> : <TaskAltRoundedIcon />
            }
            onClick={onToggle}
            disabled={busy}
            sx={{ flex: 1 }}
          >
            {order.fulfillmentStatus === 'completed' ? 'Reopen' : 'Complete'}
          </Button>
        ) : (
          <Button size="small" variant="outlined" startIcon={<PrintRoundedIcon />} onClick={onPrint} sx={{ flex: 1 }}>
            Receipt
          </Button>
        )}

        {active ? (
          <>
            <Tooltip title="More actions">
              <IconButton
                aria-label={`More actions for order ${order.id}`}
                onClick={(event) => setMenuAnchor(event.currentTarget)}
                sx={{ border: '1px solid', borderColor: 'divider' }}
              >
                <MoreVertRoundedIcon />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={() => setMenuAnchor(null)}
            >
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null)
                  onView()
                }}
              >
                <VisibilityOutlinedIcon fontSize="small" sx={{ mr: 1.5 }} />
                View details
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null)
                  onPrint()
                }}
              >
                <PrintRoundedIcon fontSize="small" sx={{ mr: 1.5 }} />
                Print receipt
              </MenuItem>
              <MenuItem
                disabled={busy}
                onClick={() => {
                  setMenuAnchor(null)
                  onCancel()
                }}
                sx={{ color: 'error.main' }}
              >
                <CancelOutlinedIcon fontSize="small" sx={{ mr: 1.5 }} />
                Cancel order
              </MenuItem>
            </Menu>
          </>
        ) : null}
      </Stack>
    </Paper>
  )
}

function DesktopOrderActions({ order, busy, onPrint, onToggle, onFulfill, onCancel, onView }) {
  return (
    <Stack direction="row" gap={0.25} sx={{ justifyContent: 'center', whiteSpace: 'nowrap' }}>
      <Tooltip title="View full order details">
        <IconButton size="small" aria-label="View order details" onClick={onView}>
          <VisibilityOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Print receipt">
        <IconButton size="small" aria-label="Print receipt" onClick={onPrint}>
          <PrintRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {order.fulfillmentStatus === 'preorder' ? (
        <Tooltip title="Reserve available stock">
          <span>
            <IconButton
              size="small"
              color="success"
              aria-label="Reserve available stock"
              onClick={onFulfill}
              disabled={busy}
            >
              <CheckCircleRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      ) : !['cancelled'].includes(order.fulfillmentStatus) ? (
        <Tooltip title={order.fulfillmentStatus === 'completed' ? 'Reopen order' : 'Mark complete'}>
          <span>
            <IconButton
              size="small"
              color={order.fulfillmentStatus === 'completed' ? 'default' : 'success'}
              aria-label={order.fulfillmentStatus === 'completed' ? 'Reopen order' : 'Mark complete'}
              onClick={onToggle}
              disabled={busy}
            >
              {order.fulfillmentStatus === 'completed' ? (
                <ReplayRoundedIcon fontSize="small" />
              ) : (
                <TaskAltRoundedIcon fontSize="small" />
              )}
            </IconButton>
          </span>
        </Tooltip>
      ) : null}
      {order.fulfillmentStatus !== 'cancelled' ? (
        <Tooltip title="Cancel order">
          <span>
            <IconButton
              size="small"
              color="error"
              aria-label="Cancel order"
              onClick={onCancel}
              disabled={busy}
            >
              <CancelOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      ) : null}
    </Stack>
  )
}

function DetailField({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ overflowWrap: 'anywhere' }}>{value || '-'}</Typography>
    </Box>
  )
}

function OrderDetailsDrawer({ order, mobile, onClose, onPrint }) {
  return (
    <Drawer
      anchor="right"
      open={Boolean(order)}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: mobile ? '100%' : 560,
            maxWidth: '100%',
          },
        },
      }}
    >
      {order ? (
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack direction="row" gap={2} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="h5" fontWeight={900}>
                Order details
              </Typography>
              <Typography variant="body2" color="text.secondary">
                #{order.id} - {order.date}
              </Typography>
            </Box>
            <IconButton aria-label="Close order details" onClick={onClose}>
              <CloseRoundedIcon />
            </IconButton>
          </Stack>

          <Stack direction="row" gap={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              color={statusColor(order.fulfillmentStatus)}
              label={order.fulfillmentStatus}
            />
            <Chip
              size="small"
              variant="outlined"
              color={order.paymentStatus === 'paid' ? 'success' : 'default'}
              label={order.paymentStatus}
            />
            {order.source ? <Chip size="small" variant="outlined" label={order.source} /> : null}
          </Stack>

          <Divider sx={{ my: 3 }} />

          <Typography variant="overline" color="text.secondary">
            Customer
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
              gap: 2,
              mt: 1,
            }}
          >
            <DetailField label="Name" value={order.customer.name} />
            <DetailField label="Phone" value={order.customer.phone} />
            <DetailField label="City" value={order.customer.city} />
            <DetailField label="Address" value={order.customer.address} />
          </Box>

          <Divider sx={{ my: 3 }} />

          <Typography variant="overline" color="text.secondary">
            Items
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            {order.items.map((item, index) => (
              <Paper key={item.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" gap={2} sx={{ justifyContent: 'space-between' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography fontWeight={800}>
                      {index + 1}. {item.type}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.variantName || [item.size, item.color].filter(Boolean).join(' / ')}
                    </Typography>
                    <Typography variant="body2">
                      {item.quantity} x {formatKs(item.unitPrice)}
                    </Typography>
                    {item.discount ? (
                      <Typography variant="caption" color="text.secondary">
                        {deductionLabel(item.deductionType)}: {formatKs(item.discount)}
                      </Typography>
                    ) : null}
                  </Box>
                  <Typography fontWeight={800} sx={{ flexShrink: 0 }}>
                    {formatKs(item.lineTotal)}
                  </Typography>
                </Stack>
              </Paper>
            ))}
          </Stack>

          <Divider sx={{ my: 3 }} />

          <Stack spacing={1}>
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
              <Typography color="text.secondary">Subtotal</Typography>
              <Typography>{formatKs(order.subtotal)}</Typography>
            </Stack>
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
              <Typography color="text.secondary">Order discount</Typography>
              <Typography>{formatKs(order.discount)}</Typography>
            </Stack>
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
              <Typography color="text.secondary">Delivery fee</Typography>
              <Typography>{formatKs(order.deliveryFee)}</Typography>
            </Stack>
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
              <Typography fontWeight={900}>Total</Typography>
              <Typography fontWeight={900} color="primary.main">
                {formatKs(order.total)}
              </Typography>
            </Stack>
          </Stack>

          <Divider sx={{ my: 3 }} />
          <DetailField label="Remark" value={order.remark} />

          <Button
            fullWidth
            variant="contained"
            startIcon={<PrintRoundedIcon />}
            onClick={onPrint}
            sx={{ mt: 3 }}
          >
            Print receipt
          </Button>
        </Box>
      ) : null}
    </Drawer>
  )
}

