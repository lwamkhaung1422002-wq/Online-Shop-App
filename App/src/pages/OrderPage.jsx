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
import SectionCard from '../components/SectionCard.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useData } from '../contexts/DataContext.jsx'
import { useFeedback } from '../contexts/FeedbackContext.jsx'
import { allocateFifo, getAvailableByVariant } from '../domain/inventory.js'
import { calculateOrderTotals, lineTotal } from '../domain/orders.js'
import { digitsOnly, validatePaymentDetails } from '../domain/payments.js'
import { createOrderAtomic, createVariantDocument } from '../services/shopApiService.js'
import {
  activePaymentMethods,
  isCodPaymentMethod,
  normalizeOptionTree,
  optionPathFromValueIds,
  optionPathSignature,
  optionValuesForLevel,
  valueIdsFromOptionPath,
  variantDisplayName,
} from '../utils/catalog.js'
import { formatKs, getStockVariantKey, getToday, SOURCE_OPTIONS } from '../utils/storage.js'

function initialLine(data) {
  const product = data.products[0]
  const variant = (product?.variants || []).find((entry) => entry.isActive !== false)
  return {
    productId: product?.id || '',
    variantId: variant?.id || '',
    optionValueIds: variant ? valueIdsFromOptionPath(variant.optionPath) : [],
    quantity: 1,
    unitPrice: variant?.price ?? product?.price ?? '',
  }
}

function stockForVariant(stocks, productId, variantId) {
  return stocks.find(
    (stock) =>
      String(stock.productId) === String(productId) &&
      String(stock.variantId || '') === String(variantId || ''),
  )
}

function variantForPath(product, optionPath) {
  const signature = optionPathSignature(optionPath)
  return (product?.variants || []).find(
    (variant) => variant.isActive !== false && optionPathSignature(variant.optionPath) === signature,
  )
}

function stockLookupKey(product, variantId) {
  return getStockVariantKey({
    productId: product?.id,
    variantId,
    type: product?.name,
    size: 'Default',
    color: '-',
  })
}

export default function OrderPage({ navigate, refresh, requireAuth }) {
  const { user } = useAuth()
  const { data } = useData()
  const { notify } = useFeedback()
  const settings = useMemo(() => data.catalogSettings || {}, [data.catalogSettings])
  const paymentMethods = useMemo(() => activePaymentMethods(settings), [settings])
  const defaultMethod = paymentMethods[0]?.name || 'Cash'
  const [orderType, setOrderType] = useState('online')
  const [customer, setCustomer] = useState({ name: '', phone: '', city: '', address: '' })
  const [date, setDate] = useState(getToday)
  const [source, setSource] = useState(SOURCE_OPTIONS[0] || 'Telegram')
  const [remark, setRemark] = useState('')
  const [preorder, setPreorder] = useState(false)
  const [orderDiscount, setOrderDiscount] = useState(0)
  const [lineDraft, setLineDraft] = useState(() => initialLine(data))
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [paymentMode, setPaymentMode] = useState('unpaid')
  const [payment, setPayment] = useState({
    method: defaultMethod,
    amount: '',
    billNumber: '',
    transactionId: '',
    date: getToday(),
    note: '',
  })
  const selectedPaymentMethod = paymentMethods.some((method) => method.name === payment.method)
    ? payment.method
    : defaultMethod

  const selectedProduct = data.products.find((product) => String(product.id) === String(lineDraft.productId))
  const optionTree = normalizeOptionTree(selectedProduct?.optionTree)
  const selectedOptionPath = optionPathFromValueIds(optionTree, lineDraft.optionValueIds)
  const selectedVariant = selectedProduct?.variants?.find((variant) => String(variant.id) === String(lineDraft.variantId))
    || variantForPath(selectedProduct, selectedOptionPath)
  const hasOptions = optionTree.levels.length > 0
  const allOptionsSelected = !hasOptions || optionTree.levels.every((_, index) => lineDraft.optionValueIds[index])
  const selectedVariantId = selectedVariant?.id || lineDraft.variantId
  const representativeStock = stockForVariant(data.stocks, lineDraft.productId, selectedVariantId)
  const availableMap = useMemo(() => getAvailableByVariant(data.stocks, data.orders), [data.orders, data.stocks])
  const available = Number(availableMap[stockLookupKey(selectedProduct, selectedVariantId)] || 0)
  const totals = useMemo(() => calculateOrderTotals(items, orderDiscount, 0), [items, orderDiscount])
  const payNow = orderType === 'in-store' || paymentMode === 'pay-now' || paymentMode === 'advanced-payment'
  const advancedPayment = paymentMode === 'advanced-payment'
  const paymentIsCod = orderType === 'online' && isCodPaymentMethod(selectedPaymentMethod, settings)
  const paymentIsCash = String(selectedPaymentMethod || '').trim().toLowerCase() === 'cash'
  const paymentAmount = advancedPayment ? Number(payment.amount || 0) : totals.total

  useEffect(() => {
    if (lineDraft.productId || !data.products.length) return
    const handle = window.setTimeout(() => setLineDraft(initialLine(data)), 0)
    return () => window.clearTimeout(handle)
  }, [data, lineDraft.productId])

  const updateLineProduct = (productId) => {
    const product = data.products.find((entry) => String(entry.id) === String(productId))
    const variant = (product?.variants || []).find((entry) => entry.isActive !== false)
    setLineDraft((current) => ({
      ...current,
      productId,
      variantId: '',
      optionValueIds: variant ? valueIdsFromOptionPath(variant.optionPath) : [],
      unitPrice: variant?.price ?? product?.price ?? '',
    }))
  }

  const updateLineOptionValue = (levelIndex, valueId) => {
    const nextValueIds = [
      ...lineDraft.optionValueIds.slice(0, levelIndex),
      valueId,
      ...lineDraft.optionValueIds.slice(levelIndex + 1),
    ]
    const path = optionPathFromValueIds(optionTree, nextValueIds)
    const variant = path.length === optionTree.levels.length ? variantForPath(selectedProduct, path) : null
    setLineDraft((current) => ({
      ...current,
      variantId: variant?.id || '',
      optionValueIds: nextValueIds,
      unitPrice: variant?.price ?? selectedProduct?.price ?? current.unitPrice,
    }))
  }

  const resolveLineVariant = async () => {
    if (!hasOptions) return null
    const path = optionPathFromValueIds(optionTree, lineDraft.optionValueIds)
    if (path.length !== optionTree.levels.length) {
      throw new Error('Choose every option before adding the item.')
    }
    const existing = variantForPath(selectedProduct, path)
    if (existing) return existing
    const result = await createVariantDocument(user.uid, selectedProduct.id, {
      name: path.map((entry) => entry.value).join(' / '),
      price: Number(lineDraft.unitPrice || selectedProduct?.price || 0),
      cost: Number(selectedProduct?.cost || 0),
      optionPath: path,
    })
    return result.variant || result
  }

  const addItem = async () => {
    const quantity = Number(lineDraft.quantity || 0)
    const unitPrice = Number(lineDraft.unitPrice || selectedVariant?.price || selectedProduct?.price || 0)
    if (!selectedProduct || !allOptionsSelected || quantity <= 0) {
      notify('Choose a product, every option, and valid quantity.', 'warning')
      return
    }
    let resolvedVariant
    try {
      resolvedVariant = await resolveLineVariant()
    } catch (error) {
      notify(error.message || 'Selected option could not be prepared.', 'error')
      return
    }
    const variantId = resolvedVariant?.id || ''
    const nextAvailable = Number(availableMap[stockLookupKey(selectedProduct, variantId)] || 0)
    if (!preorder && quantity > nextAvailable) {
      notify(`Only ${nextAvailable} item(s) are available.`, 'warning')
      return
    }
    const stock = representativeStock || {}
    const next = {
      id: crypto.randomUUID(),
      productId: selectedProduct.id,
      variantId: resolvedVariant?.id,
      type: selectedProduct.name,
      size: resolvedVariant?.optionPath?.[0]?.value || resolvedVariant?.name || 'Default',
      color: resolvedVariant?.optionPath?.[1]?.value || '-',
      variantName: resolvedVariant ? variantDisplayName(resolvedVariant) : 'Default',
      optionPath: resolvedVariant?.optionPath || [],
      quantity,
      unitPrice,
      unitCost: Number(resolvedVariant?.cost ?? selectedProduct.cost ?? stock.unitCost ?? 0),
      discount: 0,
      deductionType: 'discount',
      allocations: [],
    }
    setItems((current) => [...current, { ...next, lineTotal: lineTotal(next) }])
    setLineDraft((current) => ({
      ...initialLine(data),
      productId: current.productId,
      variantId: current.variantId,
      optionValueIds: current.optionValueIds,
    }))
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

    const finalTotals = calculateOrderTotals(preparedItems, orderDiscount, 0)
    if (payNow) {
      if (advancedPayment && (paymentAmount <= 0 || paymentAmount >= finalTotals.total)) {
        notify('Advanced payment must be greater than 0 and less than the order total.', 'warning')
        return
      }
      const paymentError = validatePaymentDetails({ ...payment, method: selectedPaymentMethod, settings, isCod: paymentIsCod })
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
        payNow
          ? {
              ...payment,
              method: selectedPaymentMethod,
              scope: advancedPayment ? 'advanced-payment' : 'order-payment',
              amount: advancedPayment ? paymentAmount : finalTotals.total,
              note: advancedPayment ? `Advanced payment${payment.note ? ` - ${payment.note}` : ''}` : payment.note,
              settings,
              isCod: paymentIsCod,
            }
          : null,
      )
      notify(orderType === 'in-store' ? 'In-store sale completed.' : 'Online order created.')
      await refresh?.()
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
          <SectionCard>
            <Typography variant="h6" className="workflow-step" data-step="1">
              Sale type
            </Typography>
            <ToggleButtonGroup value={orderType} exclusive fullWidth onChange={(_, value) => value && setOrderType(value)} sx={{ mt: 2 }}>
              <ToggleButton value="online">Online Order</ToggleButton>
              <ToggleButton value="in-store">In-Store Sale</ToggleButton>
            </ToggleButtonGroup>
          </SectionCard>

          {orderType === 'online' ? (
            <SectionCard>
              <Typography variant="h6" className="workflow-step" data-step="2">
                Customer and delivery
              </Typography>
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
            </SectionCard>
          ) : (
            <SectionCard>
              <Typography variant="h6" className="workflow-step" data-step="2">
                In-store sale
              </Typography>
              <Alert severity="info" sx={{ mt: 2 }}>
                Customer, delivery, deposit, and COD settlement details are not required for in-store sales.
              </Alert>
              <TextField sx={{ mt: 2 }} type="date" label="Sale date" value={date} onChange={(event) => setDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
            </SectionCard>
          )}

          <SectionCard>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" className="workflow-step" data-step="3">
                Add products
              </Typography>
              {orderType === 'online' ? (
                <FormControlLabel control={<Checkbox checked={preorder} onChange={(event) => setPreorder(event.target.checked)} />} label="Preorder" />
              ) : null}
            </Stack>
            <Box className="form-grid" sx={{ mt: 2 }}>
              <FormControl className="span-12">
                <InputLabel>Product</InputLabel>
                <Select label="Product" value={lineDraft.productId} onChange={(event) => updateLineProduct(event.target.value)}>
                  {data.products.map((product) => <MenuItem key={product.id} value={product.id}>{product.name}</MenuItem>)}
                </Select>
              </FormControl>
              {hasOptions ? optionTree.levels.map((level, index) => (
                <FormControl key={level.id} className="span-4">
                  <InputLabel>{level.label}</InputLabel>
                  <Select
                    label={level.label}
                    value={lineDraft.optionValueIds[index] || ''}
                    onChange={(event) => updateLineOptionValue(index, event.target.value)}
                  >
                    {optionValuesForLevel(optionTree, index).map((value) => (
                      <MenuItem key={value.id} value={value.id}>{value.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )) : null}
              <TextField className="span-4" type="number" label="Quantity" value={lineDraft.quantity} onChange={(event) => setLineDraft((current) => ({ ...current, quantity: event.target.value }))} slotProps={{ htmlInput: { min: 1 } }} />
              <TextField className="span-4" type="number" label="Unit price" value={lineDraft.unitPrice} onChange={(event) => setLineDraft((current) => ({ ...current, unitPrice: event.target.value }))} slotProps={{ htmlInput: { min: 0 } }} />
              <Stack className="span-12" direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography color={available > 3 ? 'success.main' : 'warning.main'}>Available: {available}</Typography>
                <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={addItem}>Add item</Button>
              </Stack>
            </Box>
          </SectionCard>

          <SectionCard title="Items" subtitle="Review selected products before creating the sale.">
            <Stack spacing={1.25} sx={{ mt: 2 }}>
              {items.map((item) => (
                <Box key={item.id} className="cart-line">
                  <Box>
                    <Typography fontWeight={800}>{item.type}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.variantName} - {item.quantity} x {formatKs(item.unitPrice)}
                    </Typography>
                  </Box>
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                    <Typography fontWeight={800}>{formatKs(item.lineTotal)}</Typography>
                    <IconButton color="error" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}>
                      <DeleteOutlineRoundedIcon />
                    </IconButton>
                  </Stack>
                </Box>
              ))}
              {!items.length ? <Typography color="text.secondary">No items added yet.</Typography> : null}
            </Stack>
          </SectionCard>
        </Stack>

        <Paper variant="outlined" className="order-summary-card">
          <Typography variant="h6" className="workflow-step" data-step="4">
            Summary
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 2 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography>Subtotal</Typography><Typography>{formatKs(totals.subtotal)}</Typography></Stack>
            <TextField type="number" label="Order discount" value={orderDiscount} onChange={(event) => setOrderDiscount(event.target.value)} slotProps={{ htmlInput: { min: 0 } }} />
            <TextField label={orderType === 'in-store' ? 'Note (optional)' : 'Remark'} value={remark} onChange={(event) => setRemark(event.target.value)} multiline minRows={2} />
            {orderType === 'online' ? (
              <ToggleButtonGroup value={paymentMode} exclusive fullWidth onChange={(_, value) => value && setPaymentMode(value)}>
                <ToggleButton value="unpaid">Unpaid</ToggleButton>
                <ToggleButton value="pay-now">Pay now</ToggleButton>
                <ToggleButton value="advanced-payment">Advanced payment</ToggleButton>
              </ToggleButtonGroup>
            ) : null}
            {payNow ? (
              <Stack spacing={1.5}>
                <FormControl>
                  <InputLabel>Payment method</InputLabel>
                  <Select label="Payment method" value={selectedPaymentMethod} onChange={(event) => setPayment((current) => ({ ...current, method: event.target.value, billNumber: '', transactionId: '' }))}>
                    {paymentMethods.map((method) => <MenuItem key={method.id} value={method.name}>{method.name}</MenuItem>)}
                  </Select>
                </FormControl>
                {advancedPayment ? (
                  <TextField
                    type="number"
                    label="Advanced payment amount"
                    value={payment.amount}
                    onChange={(event) => setPayment((current) => ({ ...current, amount: event.target.value }))}
                    helperText={`Remaining balance: ${formatKs(Math.max(0, totals.total - paymentAmount))}`}
                    slotProps={{ htmlInput: { min: 1, max: Math.max(1, totals.total - 1) } }}
                  />
                ) : null}
                {paymentIsCod ? (
                  <TextField label="COD reference - last 6 digits" value={payment.billNumber} onChange={(event) => setPayment((current) => ({ ...current, billNumber: digitsOnly(event.target.value) }))} slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6 } }} />
                ) : null}
                {!paymentIsCash ? (
                  <TextField label="Transaction ID - last 6 digits" value={payment.transactionId} onChange={(event) => setPayment((current) => ({ ...current, transactionId: digitsOnly(event.target.value) }))} slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6 } }} />
                ) : null}
                <TextField type="date" label="Payment date" value={payment.date} onChange={(event) => setPayment((current) => ({ ...current, date: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
                {paymentIsCash ? (
                  <TextField label="Cash note (optional)" value={payment.note} onChange={(event) => setPayment((current) => ({ ...current, note: event.target.value }))} multiline minRows={2} />
                ) : null}
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
