import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import PageHeader from '../components/PageHeader.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useData } from '../contexts/DataContext.jsx'
import { useFeedback } from '../contexts/FeedbackContext.jsx'
import { createOrderAtomic } from '../services/shopApiService.js'
import { allocateFifo, getAvailableByVariant, sortStockBatches } from '../domain/inventory.js'
import { calculateOrderTotals, deductionLabel, lineTotal } from '../domain/orders.js'
import {
  digitsOnly,
  PAYMENT_METHODS,
  validatePaymentDetails,
} from '../domain/payments.js'
import {
  SOURCE_OPTIONS,
  formatKs,
  getToday,
  getVariantKey,
} from '../utils/storage.js'
import { catalogLabels, normalizeCatalogSettings } from '../utils/catalog.js'

function initialLine(data) {
  const catalog = normalizeCatalogSettings(data.catalogSettings)
  const option1Values = data.option1Values?.length ? data.option1Values : catalog.option1Values
  const option2Values = data.option2Values?.length ? data.option2Values : catalog.option2Values
  return {
    type: data.productTypes[0] || '',
    size: option1Values[0] || 'Standard',
    color: option2Values[0] || '',
    quantity: 1,
    unitPrice: '',
    discount: 0,
    deductionType: 'discount',
  }
}

function defaultPrice(stocks, line) {
  const batch = sortStockBatches(stocks)
    .filter(
      (stock) =>
        getVariantKey(stock.size, stock.color, stock.type) ===
        getVariantKey(line.size, line.color, line.type),
    )
    .at(-1)
  return Number(batch?.salePrice ?? batch?.price ?? 0)
}

export default function OrderPage({ navigate, requireAuth = () => false }) {
  const { user } = useAuth()
  const { data } = useData()
  const { notify } = useFeedback()
  const catalog = useMemo(() => normalizeCatalogSettings(data.catalogSettings), [data.catalogSettings])
  const labels = useMemo(() => catalogLabels(catalog), [catalog])
  const option1Values = data.option1Values?.length ? data.option1Values : catalog.option1Values
  const option2Values = data.option2Values?.length ? data.option2Values : catalog.option2Values
  const [customer, setCustomer] = useState({
    name: '',
    phone: '',
    city: '',
    address: '',
  })
  const [date, setDate] = useState(getToday)
  const [source, setSource] = useState('Telegram')
  const [remark, setRemark] = useState('')
  const [preorder, setPreorder] = useState(false)
  const [orderDiscount, setOrderDiscount] = useState(0)
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [lineDraft, setLineDraft] = useState(() => initialLine(data))
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [paymentMode, setPaymentMode] = useState('unpaid')
  const [payment, setPayment] = useState({
    method: 'COD',
    billNumber: '',
    transactionId: '',
    date: getToday(),
    note: '',
  })

  const availableMap = useMemo(
    () => getAvailableByVariant(data.stocks, data.orders),
    [data.orders, data.stocks],
  )
  const available = Number(
    availableMap[getVariantKey(lineDraft.size, lineDraft.color, lineDraft.type)] || 0,
  )
  const suggestedPrice = defaultPrice(data.stocks, lineDraft)
  const totals = useMemo(
    () => calculateOrderTotals(items, orderDiscount, deliveryFee),
    [deliveryFee, items, orderDiscount],
  )

  useEffect(() => {
    const hasDraft =
      items.length > 0 ||
      customer.name.trim() ||
      customer.phone.trim() ||
      customer.address.trim() ||
      remark.trim()
    if (!hasDraft) return undefined

    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [customer, items.length, remark])

  const updateCustomer = (key, value) => {
    setCustomer((current) => ({ ...current, [key]: value }))
  }

  const updateLine = (key, value) => {
    setLineDraft((current) => {
      const next = { ...current, [key]: value }
      if (['type', 'size', 'color'].includes(key)) next.unitPrice = ''
      return next
    })
  }

  const addItem = () => {
    if (requireAuth()) return

    const quantity = Number(lineDraft.quantity || 0)
    const unitPrice = Number(lineDraft.unitPrice || suggestedPrice || 0)
    const discount = Number(lineDraft.discount || 0)

    if (!lineDraft.type || !lineDraft.color || quantity <= 0 || unitPrice < 0) {
      notify(`Choose a ${labels.product.toLowerCase()}, ${labels.option2.toLowerCase()}, valid quantity, and price.`, 'warning')
      return
    }
    if (!preorder && quantity > available) {
      notify(`Only ${available} item(s) are currently available.`, 'warning')
      return
    }

    const mergeKey = getVariantKey(lineDraft.size, lineDraft.color, lineDraft.type)
    const existing = items.find(
      (item) =>
        getVariantKey(item.size, item.color, item.type) === mergeKey &&
        item.unitPrice === unitPrice &&
        item.discount === discount &&
        item.deductionType === lineDraft.deductionType,
    )

    if (existing) {
      const mergedQuantity = existing.quantity + quantity
      if (!preorder && mergedQuantity > available) {
        notify(`Only ${available} item(s) are currently available.`, 'warning')
        return
      }
      setItems((current) =>
        current.map((item) =>
          item.id === existing.id
            ? {
                ...item,
                quantity: mergedQuantity,
                lineTotal: lineTotal({ ...item, quantity: mergedQuantity }),
              }
            : item,
        ),
      )
    } else {
      const next = {
        id: crypto.randomUUID(),
        type: lineDraft.type,
        size: lineDraft.size,
        color: lineDraft.color,
        quantity,
        unitPrice,
        unitCost: 0,
        discount,
        deductionType: lineDraft.deductionType,
        allocations: [],
      }
      setItems((current) => [...current, { ...next, lineTotal: lineTotal(next) }])
    }

    setLineDraft((current) => ({ ...initialLine(data), type: current.type, color: current.color }))
  }

  const removeItem = (id) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }

  const submitOrder = async (event) => {
    event.preventDefault()
    if (requireAuth()) return

    if (!customer.name.trim() || !customer.phone.trim()) {
      notify('Customer name and phone are required.', 'warning')
      return
    }
    if (!items.length) {
      notify('Add at least one item to the order.', 'warning')
      return
    }
    if (date > getToday()) {
      notify('Future dates cannot be used for orders.', 'warning')
      return
    }

    let preparedItems = items
    if (!preorder) {
      const result = allocateFifo(data.stocks, data.orders, items)
      if (!result.ok) {
        const shortage = result.shortage
        notify(
          `${shortage.type} ${shortage.size}/${shortage.color} is short by ${shortage.missing}.`,
          'error',
        )
        return
      }
      preparedItems = items.map((item) => {
        const allocation = result.allocations.find((entry) => entry.itemId === item.id)
        return {
          ...item,
          allocations: allocation.allocations,
          unitCost: allocation.unitCost,
        }
      })
    }

    const finalTotals = calculateOrderTotals(preparedItems, orderDiscount, deliveryFee)
    if (paymentMode === 'pay-now') {
      const paymentError = validatePaymentDetails(payment)
      if (paymentError) {
        notify(paymentError, 'warning')
        return
      }
    }
    setSaving(true)
    try {
      await createOrderAtomic(
        user.uid,
        {
          id: 'new',
          customer,
          items: preparedItems,
          date,
          ...finalTotals,
          fulfillmentStatus: preorder ? 'preorder' : 'reserved',
          paymentStatus: 'unpaid',
          source,
          remark,
        },
        data.stocks,
        data.orders,
        paymentMode === 'pay-now' ? payment : null,
      )
      notify(
        paymentMode === 'pay-now'
          ? 'Order and payment were recorded atomically.'
          : 'Multi-item order created as unpaid.',
      )
      navigate('sales')
    } catch (error) {
      notify(error.message || 'Order could not be created.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box className="page-stack">
      <PageHeader
        title="Create order"
        subtitle={`Build one customer order with multiple ${labels.productPlural.toLowerCase()}.`}
        onBack={() => navigate('home')}
      />

      <Box component="form" onSubmit={submitOrder} className="order-workspace">
        <Stack spacing={2}>
          <Paper variant="outlined" className="section-card">
            <Typography variant="h6">Customer and order</Typography>
            <Box className="form-grid" sx={{ mt: 2 }}>
              <TextField
                className="span-6"
                label="Customer name"
                value={customer.name}
                onChange={(event) => updateCustomer('name', event.target.value)}
                required
              />
              <TextField
                className="span-6"
                label="Phone"
                value={customer.phone}
                onChange={(event) => updateCustomer('phone', event.target.value)}
                required
              />
              <TextField
                className="span-4"
                type="date"
                label="Order date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                className="span-4"
                label="City"
                value={customer.city}
                onChange={(event) => updateCustomer('city', event.target.value)}
              />
              <FormControl className="span-4">
                <InputLabel>Source</InputLabel>
                <Select label="Source" value={source} onChange={(event) => setSource(event.target.value)}>
                  {SOURCE_OPTIONS.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                className="span-12"
                label="Address"
                value={customer.address}
                onChange={(event) => updateCustomer('address', event.target.value)}
                multiline
                minRows={2}
              />
            </Box>
          </Paper>

          <Paper variant="outlined" className="section-card">
            <Stack
              direction="row"
              sx={{ justifyContent: 'space-between', alignItems: 'center' }}
            >
              <Box>
                <Typography variant="h6">Add {labels.productPlural.toLowerCase()}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Add each variant to the cart before saving.
                </Typography>
              </Box>
              <FormControlLabel
                control={
                  <Checkbox checked={preorder} onChange={(event) => setPreorder(event.target.checked)} />
                }
                label="Preorder"
              />
            </Stack>

            {preorder ? (
              <Alert severity="info" sx={{ mt: 2 }}>
                Preorders do not reserve stock or count as recognized revenue.
              </Alert>
            ) : null}

            <Box className="form-grid" sx={{ mt: 2 }}>
              <FormControl className="span-3">
                <InputLabel>{labels.product}</InputLabel>
                <Select
                  label={labels.product}
                  value={lineDraft.type}
                  onChange={(event) => updateLine('type', event.target.value)}
                >
                  {data.productTypes.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl className="span-3">
                <InputLabel>{labels.option1}</InputLabel>
                <Select
                  label={labels.option1}
                  value={lineDraft.size}
                  onChange={(event) => updateLine('size', event.target.value)}
                >
                  {option1Values.map((size) => (
                    <MenuItem key={size} value={size}>
                      {size}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl className="span-3">
                <InputLabel>{labels.option2}</InputLabel>
                <Select
                  label={labels.option2}
                  value={lineDraft.color}
                  onChange={(event) => updateLine('color', event.target.value)}
                >
                  {option2Values.map((color) => (
                    <MenuItem key={color} value={color}>
                      {color}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                className="span-3"
                type="number"
                label="Quantity"
                value={lineDraft.quantity}
                onChange={(event) => updateLine('quantity', event.target.value)}
                slotProps={{ htmlInput: { min: 1 } }}
              />
              <TextField
                className="span-4"
                type="number"
                label={`Unit price${suggestedPrice ? ` · suggested ${suggestedPrice}` : ''}`}
                value={lineDraft.unitPrice}
                onChange={(event) => updateLine('unitPrice', event.target.value)}
                placeholder={String(suggestedPrice || 0)}
                slotProps={{ htmlInput: { min: 0 } }}
              />
              <Stack className="span-4" direction="row" gap={1}>
                <FormControl sx={{ width: 150, flexShrink: 0 }}>
                  <InputLabel>Option</InputLabel>
                  <Select
                    label="Option"
                    value={lineDraft.deductionType}
                    onChange={(event) => updateLine('deductionType', event.target.value)}
                  >
                    <MenuItem value="discount">Line discount</MenuItem>
                    <MenuItem value="advance-payment">Advance Payment</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  type="number"
                  label={deductionLabel(lineDraft.deductionType)}
                  value={lineDraft.discount}
                  onChange={(event) => updateLine('discount', event.target.value)}
                  slotProps={{ htmlInput: { min: 0 } }}
                  sx={{ minWidth: 0, flex: 1 }}
                />
              </Stack>
              <Stack
                className="span-4"
                direction="row"
                sx={{ alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Typography color={available > 3 ? 'success.main' : 'warning.main'}>
                  Available: {available}
                </Typography>
                <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={addItem}>
                  Add item
                </Button>
              </Stack>
            </Box>
          </Paper>

          <Paper variant="outlined" className="section-card">
            <Typography variant="h6">Order items</Typography>
            <Stack spacing={1.25} sx={{ mt: 2 }}>
              {items.map((item) => (
                <Box key={item.id} className="cart-line">
                  <Box>
                    <Typography fontWeight={800}>{item.type}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.size} · {item.color} · {item.quantity} × {formatKs(item.unitPrice)}
                    </Typography>
                  </Box>
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                    <Typography fontWeight={800}>{formatKs(item.lineTotal)}</Typography>
                    <IconButton
                      aria-label={`Remove ${item.type}`}
                      color="error"
                      onClick={() => removeItem(item.id)}
                    >
                      <DeleteOutlineRoundedIcon />
                    </IconButton>
                  </Stack>
                </Box>
              ))}
              {!items.length ? (
                <Box className="empty-state">
                  <Typography fontWeight={700}>Your order is empty</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Select a product above and choose “Add item”.
                  </Typography>
                </Box>
              ) : null}
            </Stack>
          </Paper>
        </Stack>

        <Paper variant="outlined" className="order-summary-card">
          <Typography variant="h6">Order summary</Typography>
          <Stack spacing={1.5} sx={{ mt: 2 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
              <Typography color="text.secondary">Items</Typography>
              <Typography>{items.reduce((sum, item) => sum + item.quantity, 0)}</Typography>
            </Stack>
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
              <Typography color="text.secondary">Subtotal</Typography>
              <Typography>{formatKs(totals.subtotal)}</Typography>
            </Stack>
            <TextField
              type="number"
              label="Order discount"
              value={orderDiscount}
              onChange={(event) => setOrderDiscount(event.target.value)}
              slotProps={{ htmlInput: { min: 0 } }}
            />
            <TextField
              type="number"
              label="Delivery fee"
              value={deliveryFee}
              onChange={(event) => setDeliveryFee(event.target.value)}
              slotProps={{ htmlInput: { min: 0 } }}
            />
            <TextField
              label="Remark"
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              multiline
              minRows={2}
            />
            <Divider />
            <Box>
              <Typography fontWeight={800} sx={{ mb: 1 }}>
                Payment
              </Typography>
              <ToggleButtonGroup
                value={paymentMode}
                exclusive
                fullWidth
                onChange={(_, value) => value && setPaymentMode(value)}
              >
                <ToggleButton value="unpaid">Unpaid</ToggleButton>
                <ToggleButton value="pay-now">Pay now</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {paymentMode === 'pay-now' ? (
              <Stack spacing={1.5}>
                {preorder ? (
                  <Alert severity="warning">
                    Payment is recorded now, but preorder revenue remains unrecognized until
                    fulfillment.
                  </Alert>
                ) : null}
                <FormControl>
                  <InputLabel>Payment method</InputLabel>
                  <Select
                    label="Payment method"
                    value={payment.method}
                    onChange={(event) =>
                      setPayment((current) => ({
                        ...current,
                        method: event.target.value,
                        billNumber: '',
                        transactionId: '',
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
                {payment.method === 'COD' ? (
                  <TextField
                    label="COD reference — last 6 digits"
                    value={payment.billNumber}
                    onChange={(event) =>
                      setPayment((current) => ({
                        ...current,
                        billNumber: digitsOnly(event.target.value),
                      }))
                    }
                    slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6 } }}
                    required
                  />
                ) : null}
                <TextField
                  label="Transaction ID — last 6 digits"
                  value={payment.transactionId}
                  onChange={(event) =>
                    setPayment((current) => ({
                      ...current,
                      transactionId: digitsOnly(event.target.value),
                    }))
                  }
                  slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6 } }}
                  required
                />
                <TextField
                  type="date"
                  label="Payment date"
                  value={payment.date}
                  onChange={(event) =>
                    setPayment((current) => ({ ...current, date: event.target.value }))
                  }
                  slotProps={{ inputLabel: { shrink: true } }}
                  required
                />
                <TextField
                  label="Payment note (optional)"
                  value={payment.note}
                  onChange={(event) =>
                    setPayment((current) => ({ ...current, note: event.target.value }))
                  }
                  multiline
                  minRows={2}
                />
              </Stack>
            ) : (
              <Alert severity="info">This order will appear in Finance under Outstanding.</Alert>
            )}
            <Divider />
            <Stack
              direction="row"
              sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <Typography fontWeight={800}>Total</Typography>
              <Typography variant="h5" color="primary.main" fontWeight={900}>
                {formatKs(totals.total)}
              </Typography>
            </Stack>
            <Button
              type="submit"
              variant="contained"
              color="success"
              size="large"
              startIcon={<SaveRoundedIcon />}
              disabled={saving || !items.length}
            >
              {saving
                ? 'Saving order…'
                : paymentMode === 'pay-now'
                  ? `Create & receive ${formatKs(totals.total)}`
                  : 'Create unpaid order'}
            </Button>
          </Stack>
        </Paper>
      </Box>
    </Box>
  )
}
