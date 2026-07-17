import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
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
  Typography,
  useMediaQuery,
} from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined'
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined'
import MetricCard from '../components/MetricCard.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useData } from '../contexts/DataContext.jsx'
import {
  receiveCodSettlementAtomic,
  receivePaymentAtomic,
  refundPaymentAtomic,
  voidCodSettlementAtomic,
} from '../services/shopApiService.js'
import {
  PAYMENT_METHODS,
  buildFinanceState,
  formatKs,
  getReceivedByMethod,
  getToday,
} from '../utils/storage.js'
import { useFeedback } from '../contexts/FeedbackContext.jsx'
import useSessionState from '../hooks/useSessionState.js'
import {
  digitsOnly,
  filterFinanceOrders,
  validateCodSettlement,
  validatePaymentDetails,
} from '../domain/payments.js'

const searchTypes = [
  { value: 'all', label: 'All' },
  { value: 'name', label: 'Customer' },
  { value: 'phone', label: 'Phone' },
  { value: 'tx', label: 'Transaction ID' },
  { value: 'bill', label: 'Bill Number' },
  { value: 'method', label: 'Payment Method' },
]

export default function FinancePage({ refresh }) {
  const mobile = useMediaQuery('(max-width:767px)')
  const { user } = useAuth()
  const { data } = useData()
  const { notify } = useFeedback()
  const state = useMemo(() => buildFinanceState(data), [data])
  const [searchView, setSearchView] = useSessionState('finance:search', {
    type: 'all',
    value: '',
  })
  const searchType = searchView.type
  const search = searchView.value
  const setSearchType = (value) =>
    setSearchView((current) => ({ ...current, type: value }))
  const setSearch = (value) =>
    setSearchView((current) => ({ ...current, value }))
  const [receiveOrder, setReceiveOrder] = useState(null)
  const [selectedCodOrderIds, setSelectedCodOrderIds] = useState([])
  const [codOrderSearch, setCodOrderSearch] = useState('')
  const [refundOrder, setRefundOrder] = useState(null)
  const [voidPayment, setVoidPayment] = useState(null)
  const [voidReason, setVoidReason] = useState('')
  const [detailOrder, setDetailOrder] = useState(null)
  const [savedStatusView, setStatusView] = useSessionState('finance:status:v2', 'all')
  const statusView = ['all', 'outstanding', 'received', 'refunded'].includes(savedStatusView)
    ? savedStatusView
    : 'all'
  const [working, setWorking] = useState(false)
  const [receiveDraft, setReceiveDraft] = useState({
    method: 'COD',
    billNumber: '',
    transactionId: '',
    amount: '',
    date: getToday(),
    note: '',
  })
  const [refundDraft, setRefundDraft] = useState({
    method: '',
    transactionId: '',
    date: getToday(),
    reason: '',
  })

  const financeResults = useMemo(
    () => filterFinanceOrders(state, search, searchType, statusView),
    [search, searchType, state, statusView],
  )
  const searchCounts = financeResults.counts
  const filteredOrders = financeResults.orders

  const methodBalance = getReceivedByMethod(state.payments, state.orderById)
  const totalBalance = Object.values(methodBalance).reduce((sum, value) => sum + value, 0)

  const openReceive = (order) => {
    setReceiveOrder(order)
    setSelectedCodOrderIds([order.id])
    setCodOrderSearch(order.customer.phone || '')
    setReceiveDraft({
      method: 'COD',
      billNumber: '',
      transactionId: '',
      amount: order.total,
      date: getToday(),
      note: '',
    })
  }

  const confirmReceive = async () => {
    const validationError = validatePaymentDetails(receiveDraft)
    if (validationError) {
      notify(validationError, 'warning')
      return
    }

    const selectedOrders = state.outstandingOrders.filter((order) =>
      selectedCodOrderIds.includes(order.id),
    )
    if (receiveDraft.method === 'COD') {
      const allocations = selectedOrders.map((order) => ({
        orderId: order.id,
        customerName: order.customer.name,
        phone: order.customer.phone,
        amount: order.total,
      }))
      const settlementError = validateCodSettlement(allocations, receiveDraft)
      if (settlementError) {
        notify(settlementError, 'warning')
        return
      }
    } else if (selectedCodOrderIds.length !== 1) {
      notify('Non-COD payments can receive one order at a time.', 'warning')
      return
    }

    setWorking(true)
    try {
      if (receiveDraft.method === 'COD') {
        await receiveCodSettlementAtomic(
          user.uid,
          selectedOrders.map((order) => ({
            orderId: order.id,
            customerName: order.customer.name,
            phone: order.customer.phone,
            amount: order.total,
          })),
          { ...receiveDraft, amount: Number(receiveDraft.amount) },
        )
      } else {
        await receivePaymentAtomic(user.uid, receiveOrder.id, receiveDraft)
      }
      setReceiveOrder(null)
      notify('Payment received and recorded atomically.')
      refresh()
    } catch (error) {
      notify(error.message || 'Payment could not be recorded.', 'error')
    } finally {
      setWorking(false)
    }
  }

  const openRefund = (order) => {
    const payment = state.paymentById[order.paymentId]
    if (!payment) return

    setRefundOrder(order)
    setRefundDraft({
      method: payment.method,
      transactionId: '',
      date: getToday(),
      reason: '',
    })
  }

  const openVoid = (order) => {
    const payment = state.paymentById[order.paymentId]
    if (payment?.scope !== 'cod-settlement') return
    setVoidPayment(payment)
    setVoidReason('')
  }

  const confirmVoid = async () => {
    setWorking(true)
    try {
      await voidCodSettlementAtomic(user.uid, voidPayment, voidReason)
      setVoidPayment(null)
      notify('COD settlement voided and linked orders returned to outstanding.')
      refresh()
    } catch (error) {
      notify(error.message || 'COD settlement could not be voided.', 'error')
    } finally {
      setWorking(false)
    }
  }

  const confirmRefund = async () => {
    if (!/^\d{6}$/.test(refundDraft.transactionId) || !refundDraft.date || !refundDraft.reason) {
      notify('A 6-digit refund transaction ID, date, and reason are required.', 'warning')
      return
    }

    const payment = state.paymentById[refundOrder.paymentId]
    if (!payment) return

    setWorking(true)
    try {
      await refundPaymentAtomic(user.uid, refundOrder.id, refundDraft)
      setRefundOrder(null)
      notify('Refund recorded without changing the original payment.')
      refresh()
    } catch (error) {
      notify(error.message || 'Refund could not be recorded.', 'error')
    } finally {
      setWorking(false)
    }
  }

  const detailPayment = detailOrder ? state.paymentById[detailOrder.paymentId] : null
  const detailRefund = detailOrder?.refundId ? state.paymentById[detailOrder.refundId] : null
  const allOrderCount = searchCounts.all
  const statusLabel = (order) =>
    order.paymentStatus === 'paid'
      ? 'Received'
      : order.paymentStatus === 'refunded'
        ? 'Refunded'
        : 'Outstanding'
  const statusColor = (order) =>
    order.paymentStatus === 'paid'
      ? 'success'
      : order.paymentStatus === 'refunded'
        ? 'error'
        : 'warning'
  const paymentReferenceText = (order) => {
    const payment = state.paymentById[order.paymentId]
    if (!payment) return ''
    return payment.method === 'COD'
      ? `COD ${payment.billNumber || '—'} · TX ${payment.transactionId || '—'}`
      : `${payment.method || 'Payment'} · ${payment.transactionId || '—'}`
  }
  const codCandidates = state.outstandingOrders.filter((order) => {
    const term = codOrderSearch.trim().toLowerCase()
    return (
      !term ||
      [order.customer.phone, order.customer.name, order.id].some((value) =>
        String(value || '').toLowerCase().includes(term),
      )
    )
  })
  const selectedCodOrders = state.outstandingOrders.filter((order) =>
    selectedCodOrderIds.includes(order.id),
  )
  const selectedCodTotal = selectedCodOrders.reduce((sum, order) => sum + order.total, 0)

  return (
    <Box className="page-stack finance-page">
      <PageHeader
        title="Finance / Payments"
        subtitle="Receive paid orders, process refunds, and review payment balances."
      />

      <div className="metric-grid finance-metric-grid">
        <MetricCard title="Orders Received" value={state.receivedOrders.length} tone="primary" />
        <MetricCard title="Amount Received" value={formatKs(state.totals.received)} tone="success" />
        <MetricCard title="Refunded" value={formatKs(state.totals.refunded)} tone="error" />
        <MetricCard title="Outstanding" value={formatKs(state.totals.outstanding)} tone={state.totals.outstanding > 0 ? 'warning' : 'default'} />
      </div>

      {state.anomalies.length ? (
        <Alert severity="warning">
          {state.anomalies.length} historical payment record issue(s) need review. No production
          records were changed automatically.
        </Alert>
      ) : null}

      <Paper variant="outlined" className="finance-toolbar">
        {mobile ? (
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Payment status</InputLabel>
            <Select
              label="Payment status"
              value={statusView}
              onChange={(event) => setStatusView(event.target.value)}
            >
              <MenuItem value="all">All ({allOrderCount})</MenuItem>
              <MenuItem value="outstanding">Outstanding ({searchCounts.outstanding})</MenuItem>
              <MenuItem value="received">Received ({searchCounts.received})</MenuItem>
              <MenuItem value="refunded">Refunded ({searchCounts.refunded})</MenuItem>
            </Select>
          </FormControl>
        ) : (
          <ToggleButtonGroup
            value={statusView}
            exclusive
            fullWidth
            size="small"
            onChange={(_, value) => value && setStatusView(value)}
            sx={{ mb: 2 }}
          >
            <ToggleButton value="all">All ({allOrderCount})</ToggleButton>
            <ToggleButton value="outstanding">
              Outstanding ({searchCounts.outstanding})
            </ToggleButton>
            <ToggleButton value="received">Received ({searchCounts.received})</ToggleButton>
            <ToggleButton value="refunded">Refunded ({searchCounts.refunded})</ToggleButton>
          </ToggleButtonGroup>
        )}
        <Box className="form-grid">
          <FormControl className="span-3" size="small">
            <InputLabel>Search Type</InputLabel>
            <Select label="Search Type" value={searchType} onChange={(event) => setSearchType(event.target.value)}>
              {searchTypes.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            className="span-9"
            label="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            size="small"
          />
        </Box>
      </Paper>

      {mobile ? (
        <Box className="mobile-data-list finance-mobile-list">
        {filteredOrders.map((order) => (
          <Paper key={order.id} variant="outlined" className="mobile-data-card finance-mobile-card">
            <Box className="finance-card-heading">
              <Box sx={{ minWidth: 0 }}>
                <Typography fontWeight={900} noWrap>
                  {order.customer.name || 'Unnamed customer'}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {order.customer.phone || 'No phone'} · {order.customer.city || 'No city'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {order.date} · #{order.id.slice(0, 8)}
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                <Typography fontWeight={900} color="primary.main">
                  {formatKs(order.total)}
                </Typography>
                <Chip
                  size="small"
                  color={statusColor(order)}
                  label={statusLabel(order)}
                  sx={{ mt: 0.5 }}
                />
              </Box>
            </Box>
            <Box className="finance-card-meta">
              <Typography variant="caption" color="text.secondary">Source</Typography>
              <Typography variant="body2" fontWeight={700}>{order.source || '—'}</Typography>
              {paymentReferenceText(order) ? (
                <>
                  <Typography variant="caption" color="text.secondary">Payment</Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>
                    {paymentReferenceText(order)}
                  </Typography>
                </>
              ) : null}
            </Box>
            <Stack direction="row" gap={1} className="finance-card-actions">
              <Button
                variant="outlined"
                startIcon={<InfoOutlinedIcon />}
                onClick={() => setDetailOrder(order)}
                sx={{ flex: 1 }}
              >
                Details
              </Button>
              {order.paymentStatus === 'paid' &&
              state.paymentById[order.paymentId]?.method !== 'COD' ? (
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<ReplayOutlinedIcon />}
                  onClick={() => openRefund(order)}
                  sx={{ flex: 1 }}
                >
                  Refund
                </Button>
              ) : order.paymentStatus === 'paid' &&
                state.paymentById[order.paymentId]?.scope === 'cod-settlement' ? (
                <Button
                  variant="outlined"
                  color="warning"
                  onClick={() => openVoid(order)}
                  sx={{ flex: 1 }}
                >
                  Void
                </Button>
              ) : order.paymentStatus === 'unpaid' ? (
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<PaidOutlinedIcon />}
                  onClick={() => openReceive(order)}
                  sx={{ flex: 1 }}
                >
                  Receive
                </Button>
              ) : null}
            </Stack>
          </Paper>
        ))}
        {!filteredOrders.length ? (
          <Paper variant="outlined" className="empty-state compact">
            <Typography fontWeight={800}>No {statusView} orders</Typography>
            <Typography variant="body2" color="text.secondary">
              Try another status or clear the search.
            </Typography>
          </Paper>
        ) : null}
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" className="desktop-data-table finance-table">
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Date / ID</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell>Source</TableCell>
              <TableCell>Payment reference</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredOrders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <Typography variant="body2">{order.date}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    #{order.id.slice(0, 8)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography fontWeight={800}>
                    {order.customer.name || 'Unnamed customer'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {order.customer.phone || 'No phone'} · {order.customer.city || 'No city'}
                  </Typography>
                </TableCell>
                <TableCell>{order.source || '—'}</TableCell>
                <TableCell>{paymentReferenceText(order) || '—'}</TableCell>
                <TableCell align="right">{formatKs(order.amount)}</TableCell>
                <TableCell>
                  <Chip size="small" color={statusColor(order)} label={statusLabel(order)} />
                </TableCell>
                <TableCell align="right">
                  <Box className="table-actions">
                    <Button size="small" variant="outlined" startIcon={<InfoOutlinedIcon />} onClick={() => setDetailOrder(order)}>
                      Details
                    </Button>
                    {order.paymentStatus === 'paid' &&
                    state.paymentById[order.paymentId]?.method !== 'COD' ? (
                      <Button size="small" variant="contained" color="error" startIcon={<ReplayOutlinedIcon />} onClick={() => openRefund(order)}>
                        Refund
                      </Button>
                    ) : order.paymentStatus === 'paid' &&
                      state.paymentById[order.paymentId]?.scope === 'cod-settlement' ? (
                      <Button size="small" variant="outlined" color="warning" onClick={() => openVoid(order)}>
                        Void
                      </Button>
                    ) : order.paymentStatus === 'unpaid' ? (
                      <Button size="small" variant="contained" color="success" startIcon={<PaidOutlinedIcon />} onClick={() => openReceive(order)}>
                        Receive
                      </Button>
                    ) : null}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
            {!filteredOrders.length ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  No {statusView} orders
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        </TableContainer>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Payment Method Balance
        </Typography>
        <div className="metric-grid">
          {Object.entries(methodBalance).map(([method, amount]) => (
            <MetricCard key={method} title={method} value={formatKs(amount)} />
          ))}
          {!Object.keys(methodBalance).length ? (
            <Typography color="text.secondary">No received payments yet.</Typography>
          ) : null}
        </div>
        <Divider sx={{ my: 2 }} />
        <Typography fontWeight={800}>Total Balance : {formatKs(totalBalance)}</Typography>
      </Paper>

      <Dialog open={Boolean(receiveOrder)} onClose={() => setReceiveOrder(null)} fullWidth maxWidth="md">
        <DialogTitle>
          {receiveDraft.method === 'COD' ? 'Receive COD Settlement' : 'Receive Payment'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl>
              <InputLabel>Method</InputLabel>
              <Select
                label="Method"
                value={receiveDraft.method}
                onChange={(event) =>
                  setReceiveDraft((current) => ({
                    ...current,
                    method: event.target.value,
                    billNumber: '',
                    transactionId: '',
                    amount:
                      event.target.value === 'COD'
                        ? selectedCodTotal
                        : receiveOrder?.total || '',
                  }))
                }
              >
                {PAYMENT_METHODS.map((method) => (
                  <MenuItem key={method} value={method}>
                    {method}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {receiveDraft.method === 'COD' ? (
              <>
                <Alert severity="info">
                  Search by phone, customer, or order ID. One COD settlement may contain one or
                  several outstanding orders.
                </Alert>
                <TextField
                  label="Find outstanding orders"
                  value={codOrderSearch}
                  onChange={(event) => setCodOrderSearch(event.target.value)}
                  placeholder="Phone number, customer, or order ID"
                />
                <Paper variant="outlined" className="cod-order-picker">
                  {codCandidates.slice(0, 100).map((order) => {
                    const checked = selectedCodOrderIds.includes(order.id)
                    return (
                      <Box
                        key={order.id}
                        className="cod-order-option"
                        component="label"
                      >
                        <Checkbox
                          checked={checked}
                          onChange={() => {
                            setSelectedCodOrderIds((current) => {
                              const nextIds = checked
                                ? current.filter((id) => id !== order.id)
                                : [...current, order.id].slice(0, 100)
                              const nextTotal = state.outstandingOrders
                                .filter((candidate) => nextIds.includes(candidate.id))
                                .reduce((sum, candidate) => sum + candidate.total, 0)
                              setReceiveDraft((draft) => ({ ...draft, amount: nextTotal }))
                              return nextIds
                            })
                          }}
                        />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography fontWeight={800}>{order.customer.name}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {order.customer.phone} · {order.date} · #{order.id.slice(0, 8)}
                          </Typography>
                        </Box>
                        <Typography fontWeight={800}>{formatKs(order.total)}</Typography>
                      </Box>
                    )
                  })}
                  {!codCandidates.length ? (
                    <Box className="empty-state compact">
                      <Typography>No matching outstanding orders</Typography>
                    </Box>
                  ) : null}
                </Paper>
                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography>{selectedCodOrders.length} order(s) selected</Typography>
                  <Typography fontWeight={900}>{formatKs(selectedCodTotal)}</Typography>
                </Stack>
                <TextField
                  type="number"
                  label="Transferred total"
                  value={receiveDraft.amount}
                  onChange={(event) =>
                    setReceiveDraft((current) => ({ ...current, amount: event.target.value }))
                  }
                  slotProps={{ htmlInput: { min: 0 } }}
                />
              </>
            ) : null}
            {receiveDraft.method === 'COD' ? (
              <TextField
                label="COD reference — last 6 digits"
                value={receiveDraft.billNumber}
                onChange={(event) => setReceiveDraft((current) => ({ ...current, billNumber: digitsOnly(event.target.value) }))}
                slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6 } }}
              />
            ) : null}
            <TextField
              label="Transaction ID — last 6 digits"
              value={receiveDraft.transactionId}
              onChange={(event) => setReceiveDraft((current) => ({ ...current, transactionId: digitsOnly(event.target.value) }))}
              slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6 } }}
            />
            <TextField
              type="date"
              label="Date"
              value={receiveDraft.date}
              onChange={(event) => setReceiveDraft((current) => ({ ...current, date: event.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Payment note (optional)"
              value={receiveDraft.note}
              onChange={(event) => setReceiveDraft((current) => ({ ...current, note: event.target.value }))}
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReceiveOrder(null)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={confirmReceive} disabled={working}>
            {working
              ? 'Receiving…'
              : receiveDraft.method === 'COD'
                ? `Receive ${selectedCodOrders.length} order(s)`
                : `Receive ${formatKs(receiveOrder?.total)}`}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(voidPayment)} onClose={() => setVoidPayment(null)} fullWidth maxWidth="sm">
        <DialogTitle>Void COD settlement?</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="warning">
              All {voidPayment?.orderIds?.length || 0} linked orders will return to Outstanding.
              The original settlement remains in the audit history.
            </Alert>
            <TextField
              label="Void reason"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              multiline
              minRows={3}
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVoidPayment(null)}>Cancel</Button>
          <Button color="warning" variant="contained" onClick={confirmVoid} disabled={working}>
            {working ? 'Voiding…' : 'Void settlement'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(refundOrder)} onClose={() => setRefundOrder(null)} fullWidth maxWidth="sm">
        <DialogTitle>Refund Payment</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl>
              <InputLabel>Method</InputLabel>
              <Select
                label="Method"
                value={refundDraft.method}
                onChange={(event) => setRefundDraft((current) => ({ ...current, method: event.target.value }))}
              >
                <MenuItem value={refundDraft.method}>{refundDraft.method}</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Refund Transaction ID"
              value={refundDraft.transactionId}
              onChange={(event) => setRefundDraft((current) => ({ ...current, transactionId: digitsOnly(event.target.value) }))}
              slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6 } }}
            />
            <TextField
              type="date"
              label="Date"
              value={refundDraft.date}
              onChange={(event) => setRefundDraft((current) => ({ ...current, date: event.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Refund reason"
              value={refundDraft.reason}
              onChange={(event) => setRefundDraft((current) => ({ ...current, reason: event.target.value }))}
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRefundOrder(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmRefund} disabled={working}>
            {working ? 'Refunding…' : 'Confirm Refund'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(detailOrder)} onClose={() => setDetailOrder(null)} fullWidth maxWidth="sm">
        <DialogTitle>Payment Details</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            <Typography fontWeight={800}>Receive Details</Typography>
            <Typography>Method: {detailPayment?.method || '-'}</Typography>
            <Typography>Transaction ID: {detailPayment?.transactionId || '-'}</Typography>
            <Typography>Bill Number: {detailPayment?.billNumber || '-'}</Typography>
            <Typography>Date: {detailPayment?.date || '-'}</Typography>
            <Typography>Note: {detailPayment?.note || '-'}</Typography>
            {detailPayment?.scope === 'cod-settlement' ? (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography fontWeight={800}>
                  COD settlement orders ({detailPayment.allocations?.length || 0})
                </Typography>
                {(detailPayment.allocations || []).map((allocation) => (
                  <Paper key={allocation.orderId} variant="outlined" sx={{ p: 1.25 }}>
                    <Typography fontWeight={700}>{allocation.customerName}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {allocation.phone} · #{String(allocation.orderId).slice(0, 8)}
                    </Typography>
                    <Typography variant="body2">{formatKs(allocation.amount)}</Typography>
                  </Paper>
                ))}
              </>
            ) : null}
            {detailRefund ? (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography fontWeight={800}>Refund Details</Typography>
                <Typography>Method: {detailRefund.method}</Typography>
                <Typography>Transaction ID: {detailRefund.transactionId}</Typography>
                <Typography>Date: {detailRefund.date}</Typography>
                <Typography>Reason: {detailRefund.reason}</Typography>
              </>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailOrder(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
