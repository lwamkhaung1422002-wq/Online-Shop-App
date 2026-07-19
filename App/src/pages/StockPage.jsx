import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  Typography,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import PageHeader from '../components/PageHeader.jsx'
import MetricCard from '../components/MetricCard.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useData } from '../contexts/DataContext.jsx'
import { useFeedback } from '../contexts/FeedbackContext.jsx'
import {
  adjustStockBatch,
  createStockBatch,
  createVariantDocument,
  deleteStockBatch,
  updateProductDocument,
  updateVariantDocument,
} from '../services/shopApiService.js'
import { buildStockState, formatKs, getStockVariantKey, getToday } from '../utils/storage.js'
import {
  normalizeOptionTree,
  optionPathFromValueIds,
  optionPathSignature,
  optionValuesForLevel,
  valueIdsFromOptionPath,
} from '../utils/catalog.js'
import useSessionState from '../hooks/useSessionState.js'

const emptyStockForm = {
  date: getToday(),
  productId: '',
  variantId: '',
  optionValueIds: [],
  unitCost: '',
  salePrice: '',
  quantity: 1,
  deli: 0,
}

function rowText(row) {
  return [
    row.date,
    row.productName,
    row.variantName,
    row.optionPath?.map((entry) => `${entry.label} ${entry.value}`).join(' '),
    row.note,
    row.unitCost,
    row.salePrice,
    row.quantity,
    row.available,
  ]
    .join(' ')
    .toLowerCase()
}

function buildRows(state, search) {
  const grouped = {}

  state.stocks.forEach((stock) => {
    const key = `${stock.date || '-'}__${getStockVariantKey(stock)}__${stock.unitCost}__${stock.salePrice}`
    if (!grouped[key]) {
      grouped[key] = {
        date: stock.date || '-',
        productId: stock.productId,
        variantId: stock.variantId,
        productName: stock.type || '-',
        variantName: stock.variantName || [stock.size, stock.color].filter(Boolean).join(' / ') || 'Default',
        optionPath: stock.optionPath || [],
        note: stock.note || '',
        unitCost: Number(stock.unitCost || 0),
        salePrice: Number(stock.salePrice || stock.price || 0),
        quantity: 0,
        reservedQuantity: 0,
        deli: 0,
        ids: [],
      }
    }
    grouped[key].quantity += Number(stock.quantity || 0)
    grouped[key].reservedQuantity += Number(stock.reservedQuantity || 0)
    grouped[key].deli += Number(stock.deli || 0)
    grouped[key].ids.push(String(stock.id))
  })

  const rows = Object.values(grouped)
    .map((row) => {
      const legacySold = (state.soldQtyMap[getStockVariantKey(row)] || []).reduce(
        (sum, item) => sum + Number(item.qty || 0),
        0,
      )
      const allocatedSold = row.ids.reduce(
        (sum, id) => sum + Number(state.soldBatchMap?.[id] || 0),
        0,
      )
      const reservedSold = Number(row.reservedQuantity || 0)
      const sold = allocatedSold || reservedSold || legacySold
      const adjustments = state.adjustmentMap[getStockVariantKey(row)] || []
      const adjusted = adjustments.reduce(
        (sum, item) => sum + (item.action === 'SUB' ? -1 : 1) * Number(item.qty || item.quantity || 0),
        0,
      )
      const adjustedQty = Math.max(0, Number(row.quantity || 0) + adjusted)
      return {
        ...row,
        adjustedQty,
        sold,
        available: Math.max(0, adjustedQty - sold),
      }
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  const term = String(search || '').trim().toLowerCase()
  const filteredRows = term ? rows.filter((row) => rowText(row).includes(term)) : rows
  const totals = filteredRows.reduce(
    (acc, row) => {
      acc.totalAvailable += row.available
      acc.totalQuantity += row.adjustedQty
      acc.totalSold += row.sold
      acc.totalValue += row.adjustedQty * row.unitCost
      acc.totalAvailableValue += row.available * row.unitCost
      acc.totalDeliveryCost += row.deli
      return acc
    },
    {
      totalAvailable: 0,
      totalQuantity: 0,
      totalSold: 0,
      totalValue: 0,
      totalAvailableValue: 0,
      totalDeliveryCost: 0,
    },
  )

  return { rows: filteredRows, totals }
}

function stockTone(value) {
  if (value <= 0) return 'error'
  if (value <= 3) return 'warning'
  return 'success'
}

function moneyOrBlank(value) {
  const amount = Number(value ?? 0)
  return amount > 0 ? amount : ''
}

function variantForPath(product, optionPath) {
  const signature = optionPathSignature(optionPath)
  return (product?.variants || []).find(
    (variant) => variant.isActive !== false && optionPathSignature(variant.optionPath) === signature,
  )
}

export default function StockPage({ refresh, requireAuth, navigate }) {
  const { user } = useAuth()
  const { data } = useData()
  const { notify } = useFeedback()
  const state = useMemo(() => buildStockState(data), [data])
  const [search, setSearch] = useSessionState('stock:main-search', '')
  const [stockDialogOpen, setStockDialogOpen] = useState(false)
  const [stockForm, setStockForm] = useState(emptyStockForm)
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState(null)
  const [adjustDraft, setAdjustDraft] = useState({
    action: 'ADD',
    quantity: 1,
    reason: '',
  })

  const { rows, totals } = useMemo(() => buildRows(state, search), [search, state])
  const selectedProduct = data.products.find((product) => String(product.id) === String(stockForm.productId))
  const optionTree = normalizeOptionTree(selectedProduct?.optionTree)
  const selectedOptionPath = optionPathFromValueIds(optionTree, stockForm.optionValueIds)
  const selectedVariant = selectedProduct?.variants?.find((variant) => String(variant.id) === String(stockForm.variantId))
    || variantForPath(selectedProduct, selectedOptionPath)
  const hasOptions = optionTree.levels.length > 0
  const allOptionsSelected = !hasOptions || optionTree.levels.every((_, index) => stockForm.optionValueIds[index])

  const openStockDialog = () => {
    if (requireAuth?.('add stock')) return
    const firstProduct = data.products[0]
    const firstVariant = (firstProduct?.variants || []).find((variant) => variant.isActive !== false)
    setStockForm({
      ...emptyStockForm,
      productId: firstProduct?.id || '',
      variantId: '',
      optionValueIds: firstVariant ? valueIdsFromOptionPath(firstVariant.optionPath) : [],
      unitCost: moneyOrBlank(firstVariant?.cost ?? firstProduct?.cost),
      salePrice: moneyOrBlank(firstVariant?.price ?? firstProduct?.price),
    })
    setStockDialogOpen(true)
  }

  const updateProduct = (productId) => {
    const product = data.products.find((entry) => String(entry.id) === String(productId))
    const variant = (product?.variants || []).find((entry) => entry.isActive !== false)
    setStockForm((current) => ({
      ...current,
      productId,
      variantId: '',
      optionValueIds: variant ? valueIdsFromOptionPath(variant.optionPath) : [],
      unitCost: moneyOrBlank(variant?.cost ?? product?.cost ?? current.unitCost),
      salePrice: moneyOrBlank(variant?.price ?? product?.price ?? current.salePrice),
    }))
  }

  const updateOptionValue = (levelIndex, valueId) => {
    const nextValueIds = [
      ...stockForm.optionValueIds.slice(0, levelIndex),
      valueId,
      ...stockForm.optionValueIds.slice(levelIndex + 1),
    ]
    const path = optionPathFromValueIds(optionTree, nextValueIds)
    const variant = path.length === optionTree.levels.length ? variantForPath(selectedProduct, path) : null
    setStockForm((current) => ({
      ...current,
      variantId: variant?.id || '',
      optionValueIds: nextValueIds,
      unitCost: moneyOrBlank(variant?.cost ?? selectedProduct?.cost ?? current.unitCost),
      salePrice: moneyOrBlank(variant?.price ?? selectedProduct?.price ?? current.salePrice),
    }))
  }

  const resolveSelectedVariant = async () => {
    if (!hasOptions) return null
    const path = optionPathFromValueIds(optionTree, stockForm.optionValueIds)
    if (path.length !== optionTree.levels.length) {
      throw new Error('Select every option before saving stock.')
    }
    const existing = variantForPath(selectedProduct, path)
    if (existing) return existing
    const result = await createVariantDocument(user.uid, selectedProduct.id, {
      name: path.map((entry) => entry.value).join(' / '),
      price: Number(stockForm.salePrice || selectedProduct?.price || 0),
      cost: Number(stockForm.unitCost || selectedProduct?.cost || 0),
      optionPath: path,
    })
    return result.variant || result
  }

  const saveStock = async () => {
    if (requireAuth?.('save stock')) return
    if (!stockForm.productId || !stockForm.date || Number(stockForm.quantity || 0) <= 0) {
      notify('Product, date, and quantity are required.', 'warning')
      return
    }
    if (!allOptionsSelected) {
      notify('Select every option before saving stock.', 'warning')
      return
    }

    try {
      const resolvedVariant = await resolveSelectedVariant()
      const nextCost = Number(stockForm.unitCost || resolvedVariant?.cost || selectedVariant?.cost || selectedProduct?.cost || 0)
      const nextSalePrice = Number(stockForm.salePrice || resolvedVariant?.price || selectedVariant?.price || selectedProduct?.price || 0)
      if (selectedProduct && !hasOptions) {
        await updateProductDocument(user.uid, selectedProduct.id, {
          ...selectedProduct,
          cost: nextCost,
          price: nextSalePrice,
        })
      } else if (selectedProduct && resolvedVariant) {
        await updateVariantDocument(user.uid, selectedProduct.id, resolvedVariant.id, {
          ...resolvedVariant,
          cost: nextCost,
          price: nextSalePrice,
        })
      }
      await createStockBatch(user.uid, {
        productId: stockForm.productId,
        variantId: resolvedVariant?.id || stockForm.variantId || undefined,
        type: selectedProduct?.name,
        size: resolvedVariant?.optionPath?.[0]?.value || selectedVariant?.optionPath?.[0]?.value || 'Default',
        color: resolvedVariant?.optionPath?.[1]?.value || selectedVariant?.optionPath?.[1]?.value || '-',
        date: stockForm.date,
        unitCost: nextCost,
        salePrice: nextSalePrice,
        price: nextSalePrice,
        quantity: Number(stockForm.quantity || 0),
        deli: Number(stockForm.deli || 0),
      })
      notify('Stock batch added.')
      setStockDialogOpen(false)
      await refresh?.()
    } catch (error) {
      notify(error.message || 'Stock could not be added.', 'error')
    }
  }

  const deleteStock = (row) => {
    if (requireAuth?.('delete stock')) return
    setConfirmAction({
      title: 'Delete stock batch?',
      message: 'Only unused stock can be deleted. Reserved stock is protected by the API.',
      run: async () => {
        const targets = state.stocks.filter((stock) => row.ids.includes(String(stock.id)))
        for (const stock of targets) await deleteStockBatch(user.uid, stock)
        notify('Stock batch deleted.')
        refresh()
      },
    })
  }

  const executeConfirmedAction = async () => {
    if (!confirmAction) return
    setConfirmBusy(true)
    try {
      await confirmAction.run()
      setConfirmAction(null)
    } catch (error) {
      notify(error.message || 'The operation could not be completed.', 'error')
    } finally {
      setConfirmBusy(false)
    }
  }

  const saveAdjustment = async () => {
    if (requireAuth?.('adjust stock')) return
    if (!adjustDraft.reason.trim() || Number(adjustDraft.quantity || 0) <= 0) {
      notify('Adjustment quantity and reason are required.', 'warning')
      return
    }
    setConfirmBusy(true)
    try {
      await adjustStockBatch(user.uid, adjustTarget.ids[0], adjustDraft)
      notify('Stock adjustment recorded.')
      setAdjustTarget(null)
      refresh()
    } catch (error) {
      notify(error.message || 'Stock could not be adjusted.', 'error')
    } finally {
      setConfirmBusy(false)
    }
  }

  const exportStock = async () => {
    const { exportStockPDF } = await import('../utils/reports.js')
    exportStockPDF(rows, totals)
  }

  return (
    <Box className="page-stack">
      <PageHeader
        title="Stock"
        subtitle="Manage product stock by stable variants."
        actions={
          <>
            <Button variant="outlined" startIcon={<SettingsRoundedIcon />} onClick={() => navigate('settings')}>
              App Settings
            </Button>
            <Button variant="outlined" color="error" startIcon={<PictureAsPdfRoundedIcon />} onClick={exportStock}>
              Export PDF
            </Button>
            <Button variant="contained" color="success" startIcon={<AddRoundedIcon />} onClick={openStockDialog}>
              Add Stock
            </Button>
          </>
        }
      />

      <TextField
        label="Search stock"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search product, variant, option value, note, price, or date"
        fullWidth
      />

      <div className="metric-grid wide">
        <MetricCard title="Available Stock" value={totals.totalAvailable} tone="success" />
        <MetricCard title="Total Sold" value={totals.totalSold} tone="primary" />
        <MetricCard title="Total Quantity" value={totals.totalQuantity} />
        <MetricCard title="Total Stock Value" value={formatKs(totals.totalValue)} />
        <MetricCard title="Available Stock Value" value={formatKs(totals.totalAvailableValue)} tone="success" />
        <MetricCard title="Total Delivery Cost" value={formatKs(totals.totalDeliveryCost)} tone="warning" />
      </div>

      <Box className="mobile-data-list">
        {rows.map((row) => (
          <Paper key={`${row.date}-${row.variantId || row.productName}-${row.unitCost}`} variant="outlined" className="mobile-data-card">
            <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
              <Box>
                <Typography fontWeight={900}>{row.productName}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {row.variantName} - {row.date}
                </Typography>
              </Box>
              <Chip size="small" label={`${row.available} available`} color={stockTone(row.available)} variant="outlined" />
            </Stack>
            <Box className="mobile-detail-grid">
              <MobileDetail label="Stock" value={row.adjustedQty} />
              <MobileDetail label="Sold" value={row.sold} />
              <MobileDetail label="Unit Cost" value={formatKs(row.unitCost)} />
              <MobileDetail label="Sale Price" value={formatKs(row.salePrice)} />
            </Box>
            <Stack direction="row" gap={1}>
              <Button fullWidth variant="outlined" onClick={() => setAdjustTarget(row)}>Adjust</Button>
              <Button fullWidth color="error" variant="outlined" onClick={() => deleteStock(row)}>Delete</Button>
            </Stack>
          </Paper>
        ))}
        {!rows.length ? <EmptyStock /> : null}
      </Box>

      <TableContainer component={Paper} variant="outlined" className="desktop-data-table">
        <Table className="nowrap-table" size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>No</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Product</TableCell>
              <TableCell>Variant</TableCell>
              <TableCell align="right">Unit Cost</TableCell>
              <TableCell align="right">Sale Price</TableCell>
              <TableCell align="right">Total Stock</TableCell>
              <TableCell align="right">Sold</TableCell>
              <TableCell align="right">Available</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${row.date}-${row.variantId || row.productName}-${row.unitCost}`}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>{row.date}</TableCell>
                <TableCell>{row.productName}</TableCell>
                <TableCell>{row.variantName}</TableCell>
                <TableCell align="right">{formatKs(row.unitCost)}</TableCell>
                <TableCell align="right">{formatKs(row.salePrice)}</TableCell>
                <TableCell align="right">{row.adjustedQty}</TableCell>
                <TableCell align="right">{row.sold}</TableCell>
                <TableCell align="right">
                  <Chip size="small" label={row.available} color={stockTone(row.available)} variant="outlined" />
                </TableCell>
                <TableCell>
                  <Box className="table-actions">
                    <Button size="small" variant="outlined" onClick={() => setAdjustTarget(row)}>Adjust</Button>
                    <Button size="small" color="error" variant="outlined" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => deleteStock(row)}>
                      Delete
                    </Button>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length ? (
              <TableRow>
                <TableCell colSpan={10} align="center">No stock records</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={stockDialogOpen} onClose={() => setStockDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Add Stock</DialogTitle>
        <DialogContent dividers>
          {!data.products.length ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              Create a product in App Settings before adding stock.
            </Alert>
          ) : null}
          <Box className="form-grid" sx={{ pt: 1 }}>
            <FormControl className="span-12">
              <InputLabel>Product</InputLabel>
              <Select label="Product" value={stockForm.productId} onChange={(event) => updateProduct(event.target.value)}>
                {data.products.map((product) => (
                  <MenuItem key={product.id} value={product.id}>{product.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {hasOptions ? optionTree.levels.map((level, index) => (
              <FormControl key={level.id} className="span-4">
                <InputLabel>{level.label}</InputLabel>
                <Select
                  label={level.label}
                  value={stockForm.optionValueIds[index] || ''}
                  onChange={(event) => updateOptionValue(index, event.target.value)}
                >
                  {optionValuesForLevel(optionTree, index).map((value) => (
                    <MenuItem key={value.id} value={value.id}>{value.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )) : null}
            <TextField className="span-4" type="date" label="Received Date" value={stockForm.date} onChange={(event) => setStockForm((current) => ({ ...current, date: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField className="span-4" type="number" label="Unit Cost" value={stockForm.unitCost} onChange={(event) => setStockForm((current) => ({ ...current, unitCost: event.target.value }))} slotProps={{ htmlInput: { min: 0 } }} />
            <TextField className="span-4" type="number" label="Sale Price" value={stockForm.salePrice} onChange={(event) => setStockForm((current) => ({ ...current, salePrice: event.target.value }))} slotProps={{ htmlInput: { min: 0 } }} />
            <TextField className="span-6" type="number" label="Quantity to add" value={stockForm.quantity} onChange={(event) => setStockForm((current) => ({ ...current, quantity: event.target.value }))} slotProps={{ htmlInput: { min: 1 } }} />
            <TextField className="span-6" type="number" label="Delivery Cost" value={stockForm.deli} onChange={(event) => setStockForm((current) => ({ ...current, deli: event.target.value }))} slotProps={{ htmlInput: { min: 0 } }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStockDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={saveStock} disabled={!data.products.length}>Save Stock</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(adjustTarget)} onClose={() => setAdjustTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Adjust stock</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField select label="Action" value={adjustDraft.action} onChange={(event) => setAdjustDraft((current) => ({ ...current, action: event.target.value }))}>
              <MenuItem value="ADD">Add stock</MenuItem>
              <MenuItem value="SUB">Remove stock</MenuItem>
            </TextField>
            <TextField type="number" label="Quantity" value={adjustDraft.quantity} onChange={(event) => setAdjustDraft((current) => ({ ...current, quantity: event.target.value }))} slotProps={{ htmlInput: { min: 1 } }} />
            <TextField label="Reason" value={adjustDraft.reason} onChange={(event) => setAdjustDraft((current) => ({ ...current, reason: event.target.value }))} multiline minRows={3} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjustTarget(null)} disabled={confirmBusy}>Cancel</Button>
          <Button variant="contained" onClick={saveAdjustment} disabled={confirmBusy}>{confirmBusy ? 'Saving...' : 'Save adjustment'}</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title || 'Confirm action'}
        message={confirmAction?.message || ''}
        busy={confirmBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={executeConfirmedAction}
      />
    </Box>
  )
}

function EmptyStock() {
  return (
    <Box className="empty-state">
      <Typography fontWeight={800}>No stock records</Typography>
    </Box>
  )
}

function MobileDetail({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography fontWeight={800}>{value}</Typography>
    </Box>
  )
}
