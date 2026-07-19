import { useMemo, useState } from 'react'
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
import { allocateFifo, getAvailableByVariant } from '../domain/inventory.js'
import { calculateOrderTotals, lineTotal } from '../domain/orders.js'
import { digitsOnly, validatePaymentDetails } from '../domain/payments.js'
import { createOrderAtomic } from '../services/shopApiService.js'
import { activePaymentMethods, isCodPaymentMethod, variantDisplayName } from '../utils/catalog.js'
import { formatKs, getStockVariantKey, getToday, SOURCE_OPTIONS } from '../utils/storage.js'

function initialLine(data) {
  const product = data.products[0]
  const variant = product?.variants?.[0]
  return {
    productId: product?.id || '',
    variantId: variant?.id || '',
    quantity: 1,
    unitPrice: variant?.price ?? product?.price ?? '',
    discount: 0,
  }
}

function stockForVariant(stocks, productId, variantId) {
  return stocks.find(
    (stock) =>
      String(stock.productId) === String(productId) &&
      String(stock.variantId || '') === String(variantId || ''),
  )
}

export default function OrderPage({ navigate, requireAuth }) {
  const { user } = useAuth()
  const { data } = useData()
  const { notify } = useFeedback()
  const settings = data.catalogSettings || {}
  const paymentMethods = activePaymentMethods(settings)
  const defaultMethod = paymentMethods[0]?.name || 'Cash'
  const [orderType, setOrderType] = useState('online')
  const [customer, setCustomer] = useState({ name: '', phone: '', city: '', address: '' })
  const [date, setDate] = useState(getToday)
  const [source, setSource] = useState(SOURCE_OPTIONS[0] || 'Telegram')
  const [remark, setRemark] = useState('')
  const [preorder, setPreorder] = useState(false)
  const [orderDiscount, setOrderDiscount] = useState(0)
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [lineDraft, setLineDraft] = useState(() => initialLine(data))
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [paymentMode, setPaymentMode] = useState('unpaid')
  const [payment, setPayment] = useState({
    method: defaultMethod,
    billNumber: '',
    transactionId: '',
    date: getToday(),
    note: '',
  })

  const selectedProduct = data.products.find((product) => String(product.id) === String(lineDraft.productId))
  const selectedVariant = selectedProduct?.variants?.find((variant) => String(variant.id) === String(lineDraft.variantId))
  const representativeStock = stockForVariant(data.stocks, lineDraft.productId, lineDraft.variantId)
  const availableMap = useMemo(() => getAvailableByVariant(data.stocks, data.orders), [data.orders, data.stocks])
  const available = Number(availableMap[getStockVariantKey({ productId: lineDraft.productId, variantId: lineDraft.variantId })] || 0)
  const totals = useMemo(() => calculateOrderTotals(items, orderDiscount, orderType === 'online' ? deliveryFee : 0), [deliveryFee, items, orderDiscount, orderType])
  const payNow = orderType === 'in-store' || paymentMode === 'pay-now'
  const paymentIsCod = orderType === 'online' && isCodPaymentMethod(payment.method, settings)

  const updateLineProduct = (productId) => {
    const product = data.products.find((entry) => String(entry.id) === String(productId))
    const variant = product?.variants?.[0]
    setLineDraft((current) => ({
      ...current,
      productId,
      variantId: variant?.id || '',
      unitPrice: variant?.price ?? product?.price ?? '',
    }))
  }

  const updateLineVariant = (variantId) => {
    const variant = selectedProduct?.variants?.find((entry) => String(entry.id) === String(variantId))
    setLineDraft((current) => ({
      ...current,
      variantId,
      unitPrice: variant?.price ?? selectedProduct?.price ?? current.unitPrice,
    }))
  }

  const addItem = () => {
    const quantity = Number(lineDraft.quantity || 0)
    const unitPrice = Number(lineDraft.unitPrice || selectedVariant?.price || selectedProduct?.price || 0)
    const discount = Number(lineDraft.discount || 0)
    if (!selectedProduct || (selectedProduct.variants?.length && !selectedVariant) || quantity <= 0) {
      notify('Choose a product, final variant, and valid quantity.', 'warning')
      return
    }
    if (!preorder && quantity > available) {
      notify(`Only ${available} item(s) are available.`, 'warning')
      return
    }
    const stock = representativeStock || {}
    const next = {
      id: crypto.randomUUID(),
      productId: selectedProduct.id,
      variantId: selectedVariant?.id,
      type: selectedProduct.name,
      size: selectedVariant?.optionPath?.[0]?.value || selectedVariant?.name || 'Default',
      color: selectedVariant?.optionPath?.[1]?.value || '-',
      variantName: selectedVariant ? variantDisplayName(selectedVariant) : 'Default',
      optionPath: selectedVariant?.optionPath || [],
      quantity,
      unitPrice,
      unitCost: Number(selectedVariant?.cost ?? selectedProduct.cost ?? stock.unitCost ?? 0),
      discount,
      deductionType: 'discount',
      allocations: [],
    }
    setItems((current) => [...current, { ...next, lineTotal: lineTotal(next) }])
    setLineDraft((current) => ({ ...initialLine(data), productId: current.productId, variantId: current.variantId }))
  }

  const submitOrder = async (event) => {
    event.preventDefault()
    if (requireAuth?.('create sale')) return
    if (orderType === 'online' && (!customer.name.trim() || !customer.phone.trim())) {
      notify('Customer name and phone are required for online orders.', 'warning')
      return
    }
    if (!items.length) {
      notify('Add at least one item.', 'warning')
      return
    }
    if (date > getToday()) {
      notify('Future dates cannot be used.', 'warning')
      return
    }

    let preparedItems = items
    if (!preorder) {
      const allocation = allocateFifo(data.stocks, data.orders, items)
      if (!allocation.ok) {
        notify('There is not enough stock for one selected variant.', 'error')
        return
      }
      preparedItems = items.map((item) => {
        const lineAllocation = allocation.allocations.find((entry) => entry.itemId === item.id)
        return { ...item, allocations: lineAllocation.allocations, unitCost: lineAllocation.unitCost }
      })
    }

    if (payNow) {
      const paymentError = validatePaymentDetails({ ...payment, settings, isCod: paymentIsCod })
      if (paymentError) {
        notify(paymentError, 'warning')
        return
      }
    }

    const finalTotals = calculateOrderTotals(preparedItems, orderDiscount, orderType === 'online' ? deliveryFee : 0)
    setSaving(true)
    try {
      await createOrderAtomic(
        user.uid,
        {
          orderType,
          customer: orderType === 'online' ? customer : undefined,
          items: preparedItems,
          date,
          ...finalTotals,
          fulfillmentStatus: preorder ? 'preorder' : 'reserved',
          paymentStatus: 'unpaid',
          source: orderType === 'online' ? source : 'In-Store',
          remark,
        },
        data.stocks,
        data.orders,
        payNow ? { ...payment, settings, isCod: paymentIsCod } : null,
      )
      notify(orderType === 'in-store' ? 'In-store sale completed.' : 'Online order created.')
      navigate('sales')
    } catch (error) {
      notify(error.message || 'Sale could not be created.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box className="page-stack">
      <PageHeader title="Create sale" subtitle="Create online orders or immediate in-store sales." onBack={() => navigate('home')} />

      <Box component="form" onSubmit={submitOrder} className="order-workspace">
        <Stack spacing={2}>
          <Paper variant="outlined" className="section-card">
            <Typography variant="h6">Sale type</Typography>
            <ToggleButtonGroup value={orderType} exclusive fullWidth onChange={(_, value) => value && setOrderType(value)} sx={{ mt: 2 }}>
              <ToggleButton value="online">Online Order</ToggleButton>
              <ToggleButton value="in-store">In-Store Sale</ToggleButton>
            </ToggleButtonGroup>
          </Paper>

          {orderType === 'online' ? (
            <Paper variant="outlined" className="section-card">
              <Typography variant="h6">Customer and delivery</Typography>
              <Box className="form-grid" sx={{ mt: 2 }}>
                <TextField className="span-6" label="Customer name" value={customer.name} onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))} required />
                <TextField className="span-6" label="Phone" value={customer.phone} onChange={(event) => setCustomer((current) => ({ ...current, phone: event.target.value }))} required />
                <TextField className="span-4" type="date" label="Order date" value={date} onChange={(event) => setDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField className="span-4" label="City" value={customer.city} onChange={(event) => setCustomer((current) => ({ ...current, city: event.target.value }))} />
                <FormControl className="span-4">
                  <InputLabel>Source</InputLabel>
                  <Select label="Source" value={source} onChange={(event) => setSource(event.target.value)}>
                    {SOURCE_OPTIONS.map((option) => (
                      <MenuItem key={option} value={option}>{option}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField className="span-12" label="Address" value={customer.address} onChange={(event) => setCustomer((current) => ({ ...current, address: event.target.value }))} multiline minRows={2} />
              </Box>
            </Paper>
          ) : (
            <Paper variant="outlined" className="section-card">
              <Typography variant="h6">In-store sale</Typography>
              <Alert severity="info" sx={{ mt: 2 }}>
                Customer, delivery, deposit, and COD settlement details are not required for in-store sales.
              </Alert>
              <TextField sx={{ mt: 2 }} type="date" label="Sale date" value={date} onChange={(event) => setDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
            </Paper>
          )}

          <Paper variant="outlined" className="section-card">
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">Add products</Typography>
              {orderType === 'online' ? (
                <FormControlLabel control={<Checkbox checked={preorder} onChange={(event) => setPreorder(event.target.checked)} />} label="Preorder" />
              ) : null}
            </Stack>
            <Box className="form-grid" sx={{ mt: 2 }}>
              <FormControl className="span-6">
                <InputLabel>Product</InputLabel>
                <Select label="Product" value={lineDraft.productId} onChange={(event) => updateLineProduct(event.target.value)}>
                  {data.products.map((product) => <MenuItem key={product.id} value={product.id}>{product.name}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl className="span-6" disabled={!selectedProduct?.variants?.length}>
                <InputLabel>Variant</InputLabel>
                <Select label="Variant" value={lineDraft.variantId} onChange={(event) => updateLineVariant(event.target.value)}>
                  {(selectedProduct?.variants || []).filter((variant) => variant.isActive !== false).map((variant) => (
                    <MenuItem key={variant.id} value={variant.id}>{variantDisplayName(variant)}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField className="span-4" type="number" label="Quantity" value={lineDraft.quantity} onChange={(event) => setLineDraft((current) => ({ ...current, quantity: event.target.value }))} slotProps={{ htmlInput: { min: 1 } }} />
              <TextField className="span-4" type="number" label="Unit price" value={lineDraft.unitPrice} onChange={(event) => setLineDraft((current) => ({ ...current, unitPrice: event.target.value }))} slotProps={{ htmlInput: { min: 0 } }} />
              <TextField className="span-4" type="number" label="Advanced payment" value={lineDraft.discount} onChange={(event) => setLineDraft((current) => ({ ...current, discount: event.target.value }))} slotProps={{ htmlInput: { min: 0 } }} />
              <Stack className="span-12" direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography color={available > 3 ? 'success.main' : 'warning.main'}>Available: {available}</Typography>
                <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={addItem}>Add item</Button>
              </Stack>
            </Box>
          </Paper>

          <Paper variant="outlined" className="section-card">
            <Typography variant="h6">Items</Typography>
            <Stack spacing={1.25} sx={{ mt: 2 }}>
              {items.map((item) => (
                <Box key={item.id} className="cart-line">
                  <Box>
                    <Typography fontWeight={800}>{item.type}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.variantName} - {item.quantity} x {formatKs(item.unitPrice)}
                    </Typography>
                  </Box>
                  <Stack direction="row" alignItems="center" gap={1}>
                    <Typography fontWeight={800}>{formatKs(item.lineTotal)}</Typography>
                    <IconButton color="error" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}>
                      <DeleteOutlineRoundedIcon />
                    </IconButton>
                  </Stack>
                </Box>
              ))}
              {!items.length ? <Typography color="text.secondary">No items added yet.</Typography> : null}
            </Stack>
          </Paper>
        </Stack>

        <Paper variant="outlined" className="order-summary-card">
          <Typography variant="h6">Summary</Typography>
          <Stack spacing={1.5} sx={{ mt: 2 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography>Subtotal</Typography><Typography>{formatKs(totals.subtotal)}</Typography></Stack>
            <TextField type="number" label="Order discount" value={orderDiscount} onChange={(event) => setOrderDiscount(event.target.value)} slotProps={{ htmlInput: { min: 0 } }} />
            {orderType === 'online' ? (
              <TextField type="number" label="Delivery fee" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} slotProps={{ htmlInput: { min: 0 } }} />
            ) : null}
            <TextField label={orderType === 'in-store' ? 'Note (optional)' : 'Remark'} value={remark} onChange={(event) => setRemark(event.target.value)} multiline minRows={2} />
            {orderType === 'online' ? (
              <ToggleButtonGroup value={paymentMode} exclusive fullWidth onChange={(_, value) => value && setPaymentMode(value)}>
                <ToggleButton value="unpaid">Unpaid</ToggleButton>
                <ToggleButton value="pay-now">Pay now</ToggleButton>
              </ToggleButtonGroup>
            ) : null}
            {payNow ? (
              <Stack spacing={1.5}>
                <FormControl>
                  <InputLabel>Payment method</InputLabel>
                  <Select label="Payment method" value={payment.method} onChange={(event) => setPayment((current) => ({ ...current, method: event.target.value, billNumber: '', transactionId: '' }))}>
                    {paymentMethods.map((method) => <MenuItem key={method.id} value={method.name}>{method.name}</MenuItem>)}
                  </Select>
                </FormControl>
                {paymentIsCod ? (
                  <TextField label="COD reference - last 6 digits" value={payment.billNumber} onChange={(event) => setPayment((current) => ({ ...current, billNumber: digitsOnly(event.target.value) }))} slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6 } }} />
                ) : null}
                <TextField label="Transaction ID - last 6 digits" value={payment.transactionId} onChange={(event) => setPayment((current) => ({ ...current, transactionId: digitsOnly(event.target.value) }))} slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6 } }} />
                <TextField type="date" label="Payment date" value={payment.date} onChange={(event) => setPayment((current) => ({ ...current, date: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
              </Stack>
            ) : <Alert severity="info">This order will appear in Finance as outstanding.</Alert>}
            <Divider />
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography fontWeight={900}>Total</Typography>
              <Typography variant="h5" color="primary.main" fontWeight={900}>{formatKs(totals.total)}</Typography>
            </Stack>
            <Button type="submit" variant="contained" color="success" size="large" startIcon={<SaveRoundedIcon />} disabled={saving || !items.length}>
              {saving ? 'Saving...' : orderType === 'in-store' ? `Complete sale ${formatKs(totals.total)}` : 'Create order'}
            </Button>
          </Stack>
        </Paper>
      </Box>
    </Box>
  )
}
