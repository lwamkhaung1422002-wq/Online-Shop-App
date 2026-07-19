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
  useMediaQuery,
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
import {
  adjustStockBatch,
  createStockBatch,
  deleteStockBatch,
  saveCatalogItems,
} from '../services/shopApiService.js'
import { useFeedback } from '../contexts/FeedbackContext.jsx'
import {
  SIZE_OPTIONS,
  buildStockState,
  formatKs,
  getToday,
  getVariantKey,
} from '../utils/storage.js'
import { normalizeOrders } from '../domain/orders.js'
import useSessionState from '../hooks/useSessionState.js'

const emptyStockForm = {
  date: getToday(),
  deli: 0,
  size: 'Size 1',
  color: '',
  type: '',
  unitCost: '',
  salePrice: '',
  quantity: 1,
}

function getSold(state, size, color, type, from = null, to = null) {
  const list = state.soldQtyMap[getVariantKey(size, color, type)] || []
  return list.reduce((sum, item) => {
    if (from && item.date < from) return sum
    if (to && item.date > to) return sum
    return sum + item.qty
  }, 0)
}

function getAdjustmentQty(state, action, size, color, type, from = null, to = null) {
  const list = state.adjustmentMap[getVariantKey(size, color, type)] || []
  return list.reduce((sum, item) => {
    if (item.stockBatchId) return sum
    if (item.action !== action) return sum
    if (from && item.date < from) return sum
    if (to && item.date > to) return sum
    return sum + Number(item.qty || 0)
  }, 0)
}

function buildRows(state, filters) {
  const grouped = {}
  const from = filters.from || null
  const to = filters.to || null

  state.stocks.forEach((stock) => {
    if (from && stock.date < from) return
    if (to && stock.date > to) return
    if (filters.size && stock.size !== filters.size) return
    if (filters.color && stock.color !== filters.color) return
    if (filters.type && stock.type !== filters.type) return

    const unitCost = Number(stock.unitCost ?? stock.cost ?? stock.price ?? 0)
    const salePrice = Number(stock.salePrice ?? stock.price ?? 0)
    const key = `${stock.date || '-'}__${stock.size}__${stock.color}__${stock.type || '-'}__${unitCost}__${salePrice}`

    if (!grouped[key]) {
      grouped[key] = {
        date: stock.date || '-',
        size: stock.size,
        color: stock.color,
        type: stock.type || '-',
        unitCost,
        salePrice,
        quantity: 0,
        deli: 0,
        ids: [],
        reservedQuantity: 0,
      }
    }

    grouped[key].quantity += Number(stock.quantity || 0)
    grouped[key].deli += Number(stock.deli || 0)
    grouped[key].ids.push(String(stock.id))
    grouped[key].reservedQuantity += Number(stock.reservedQuantity || 0)
  })

  const groupedRows = Object.values(grouped)
  const itemBuckets = {}

  groupedRows.forEach((row) => {
    const itemKey = getVariantKey(row.size, row.color, row.type)
    if (!itemBuckets[itemKey]) itemBuckets[itemKey] = []
    itemBuckets[itemKey].push(row)
  })

  const rows = []

  Object.values(itemBuckets).forEach((bucket) => {
    bucket.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

    const base = bucket[0]
    let remainingSold = getSold(state, base.size, base.color, base.type, from, to)
    let remainingAdj =
      getAdjustmentQty(state, 'ADD', base.size, base.color, base.type, from, to) -
      getAdjustmentQty(state, 'SUB', base.size, base.color, base.type, from, to)

    bucket.forEach((row) => {
      let adjustedQty = Number(row.quantity || 0)

      if (remainingAdj > 0) {
        adjustedQty += remainingAdj
        remainingAdj = 0
      } else if (remainingAdj < 0) {
        const reducible = Math.min(adjustedQty, Math.abs(remainingAdj))
        adjustedQty -= reducible
        remainingAdj += reducible
      }

      adjustedQty = Math.max(0, adjustedQty)

      const sold = Math.min(adjustedQty, Math.max(0, remainingSold))
      remainingSold -= sold

      const available = Math.max(0, adjustedQty - sold)
      rows.push({ ...row, sold, adjustedQty, available })
    })
  })

  rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  const totals = rows.reduce(
    (acc, row) => {
      acc.totalAvailable += row.available
      acc.totalQuantity += row.adjustedQty
      acc.totalValue += row.adjustedQty * row.unitCost
      acc.totalAvailableValue += row.available * row.unitCost
      acc.totalSold += row.sold
      acc.totalDeliveryCost += row.deli
      return acc
    },
    {
      totalAvailable: 0,
      totalQuantity: 0,
      totalValue: 0,
      totalAvailableValue: 0,
      totalSold: 0,
      totalDeliveryCost: 0,
    },
  )

  return { rows, totals }
}

function getStockTone(available) {
  if (available <= 0) return 'error'
  if (available <= 3) return 'warning'
  return 'success'
}

export default function StockPage({ refresh }) {
  const { user } = useAuth()
  const { data } = useData()
  const { notify } = useFeedback()
  const state = useMemo(() => buildStockState(data), [data])
  const mobile = useMediaQuery('(max-width:767px)')
  const [newType, setNewType] = useState('')
  const [newColor, setNewColor] = useState('')
  const [filters, setFilters] = useSessionState('stock:filters', {
    type: '',
    size: '',
    color: '',
    from: '',
    to: '',
  })
  const [stockDialogOpen, setStockDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [stockForm, setStockForm] = useState(emptyStockForm)
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState(null)
  const [adjustDraft, setAdjustDraft] = useState({
    action: 'ADD',
    quantity: 1,
    date: getToday(),
    reason: '',
  })

  const { rows, totals } = useMemo(() => buildRows(state, filters), [state, filters])
  const catalogUsage = useMemo(() => {
    const types = {}
    const colors = {}
    state.stocks.forEach((stock) => {
      types[stock.type || '-'] = (types[stock.type || '-'] || 0) + 1
      colors[stock.color] = (colors[stock.color] || 0) + 1
    })
    normalizeOrders(data.orders).forEach((order) =>
      order.items.forEach((item) => {
        types[item.type] = (types[item.type] || 0) + 1
        colors[item.color] = (colors[item.color] || 0) + 1
      }),
    )
    return { types, colors }
  }, [data.orders, state.stocks])

  const handleExportStockPDF = async () => {
    const { exportStockPDF } = await import('../utils/reports.js')
    exportStockPDF(rows, totals)
  }

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const openStockDialog = () => {
    setStockForm({
      ...emptyStockForm,
      color: state.productColors[0] || '',
      type: state.productTypes[0] || '',
    })
    setStockDialogOpen(true)
  }

  const addType = async () => {
    const value = newType.trim()
    if (!value) return

    if (state.productTypes.includes(value)) {
      notify('This product type already exists.', 'warning')
      return
    }

    await saveCatalogItems(user.uid, 'productTypes', [...state.productTypes, value])
    setNewType('')
    refresh()
  }

  const addColor = async () => {
    const value = newColor.trim()
    if (!value) return

    if (state.productColors.includes(value)) {
      notify('This color already exists.', 'warning')
      return
    }

    await saveCatalogItems(user.uid, 'productColors', [...state.productColors, value])
    setNewColor('')
    refresh()
  }

  const deleteType = async (type) => {
    if (catalogUsage.types[type]) {
      notify('This type is already used and cannot be deleted.', 'warning')
      return
    }
    setConfirmAction({
      title: 'Delete product type?',
      message: `Delete “${type}” from the catalog?`,
      run: async () => {
        await saveCatalogItems(
          user.uid,
          'productTypes',
          state.productTypes.filter((item) => item !== type),
        )
        notify('Product type deleted.')
        refresh()
      },
    })
  }

  const deleteColor = async (color) => {
    if (catalogUsage.colors[color]) {
      notify('This color is already used and cannot be deleted.', 'warning')
      return
    }
    setConfirmAction({
      title: 'Delete product color?',
      message: `Delete “${color}” from the catalog?`,
      run: async () => {
        await saveCatalogItems(
          user.uid,
          'productColors',
          state.productColors.filter((item) => item !== color),
        )
        notify('Product color deleted.')
        refresh()
      },
    })
  }

  const saveStock = async () => {
    if (!stockForm.date || stockForm.unitCost === '' || stockForm.salePrice === '' || !stockForm.quantity) {
      notify('Date, cost, sale price, and quantity are required.', 'warning')
      return
    }

    try {
      await createStockBatch(user.uid, {
        date: stockForm.date,
        deli: Number(stockForm.deli || 0),
        size: stockForm.size,
        color: stockForm.color,
        type: stockForm.type || '-',
        unitCost: Number(stockForm.unitCost || 0),
        salePrice: Number(stockForm.salePrice || 0),
        price: Number(stockForm.salePrice || 0),
        quantity: Number(stockForm.quantity || 0),
      })
      setStockDialogOpen(false)
      notify('Stock batch added.')
      refresh()
    } catch (error) {
      notify(error.message || 'Stock could not be added.', 'error')
    }
  }

  const deleteStock = async (row) => {
    setConfirmAction({
      title: 'Delete stock batch?',
      message:
        'Only unused stock can be deleted. Reserved stock will be protected automatically.',
      run: async () => {
        const targets = state.stocks.filter((stock) => row.ids.includes(String(stock.id)))
        for (const stock of targets) await deleteStockBatch(user.uid, stock)
        notify('Unused stock batch deleted.')
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
    if (!adjustDraft.reason.trim() || Number(adjustDraft.quantity || 0) <= 0) {
      notify('Adjustment quantity and reason are required.', 'warning')
      return
    }
    setConfirmBusy(true)
    try {
      await adjustStockBatch(user.uid, adjustTarget.ids[0], adjustDraft)
      setAdjustTarget(null)
      notify('Stock adjustment recorded in the audit history.')
      refresh()
    } catch (error) {
      notify(error.message || 'Stock could not be adjusted.', 'error')
    } finally {
      setConfirmBusy(false)
    }
  }

  return (
    <Box className="page-stack">
      <PageHeader
        title="Stock"
        subtitle="Manage product catalog, stock batches, sold quantities, and stock value."
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={<SettingsRoundedIcon />}
              onClick={() => setSettingsOpen(true)}
            >
              Settings
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<PictureAsPdfRoundedIcon />}
              onClick={handleExportStockPDF}
            >
              Export PDF
            </Button>
            <Button variant="contained" color="success" startIcon={<AddRoundedIcon />} onClick={openStockDialog}>
              Add Stock
            </Button>
          </>
        }
      />

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box className="form-grid">
          <FormControl size="small" className="span-3">
            <InputLabel>Type</InputLabel>
            <Select label="Type" value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}>
              <MenuItem value="">All Types</MenuItem>
              {state.productTypes.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" className="span-3">
            <InputLabel>Size</InputLabel>
            <Select label="Size" value={filters.size} onChange={(event) => updateFilter('size', event.target.value)}>
              <MenuItem value="">All Sizes</MenuItem>
              {SIZE_OPTIONS.map((size) => (
                <MenuItem key={size} value={size}>
                  {size}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" className="span-3">
            <InputLabel>Color</InputLabel>
            <Select label="Color" value={filters.color} onChange={(event) => updateFilter('color', event.target.value)}>
              <MenuItem value="">All Colors</MenuItem>
              {state.productColors.map((color) => (
                <MenuItem key={color} value={color}>
                  {color}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            className="span-3"
            type="date"
            label="From"
            value={filters.from}
            onChange={(event) => updateFilter('from', event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            size="small"
          />
          <TextField
            className="span-3"
            type="date"
            label="To"
            value={filters.to}
            onChange={(event) => updateFilter('to', event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            size="small"
          />
        </Box>
      </Paper>

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
          <Paper
            key={`${row.date}-${row.size}-${row.color}-${row.type}-${row.unitCost}-${row.salePrice}`}
            variant="outlined"
            className="mobile-data-card"
          >
            <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
              <Box>
                <Typography fontWeight={900}>{row.type}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {row.size} · {row.color} · {row.date}
                </Typography>
              </Box>
              <Chip
                size="small"
                label={`${row.available} available`}
                color={getStockTone(row.available)}
                variant="outlined"
              />
            </Stack>
            <Box className="mobile-detail-grid">
              <MobileDetail label="Stock" value={row.adjustedQty} />
              <MobileDetail label="Reserved/Sold" value={row.sold} />
              <MobileDetail label="Unit Cost" value={formatKs(row.unitCost)} />
              <MobileDetail label="Sale Price" value={formatKs(row.salePrice)} />
            </Box>
            <Stack direction="row" gap={1}>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => {
                  setAdjustDraft({
                    action: 'ADD',
                    quantity: 1,
                    date: getToday(),
                    reason: '',
                  })
                  setAdjustTarget(row)
                }}
              >
                Adjust
              </Button>
              <Button fullWidth color="error" variant="outlined" onClick={() => deleteStock(row)}>
                Delete
              </Button>
            </Stack>
          </Paper>
        ))}
        {!rows.length ? (
          <Box className="empty-state">
            <Typography fontWeight={800}>No stock records</Typography>
          </Box>
        ) : null}
      </Box>

      <TableContainer component={Paper} variant="outlined" className="desktop-data-table">
        <Table className="nowrap-table" size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>No</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Color</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="right">Unit Cost</TableCell>
              <TableCell align="right">Sale Price</TableCell>
              <TableCell align="right">Total Stock</TableCell>
              <TableCell align="right">Sold</TableCell>
              <TableCell align="right">Available</TableCell>
              <TableCell align="right">Delivery Cost</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${row.date}-${row.size}-${row.color}-${row.type}-${row.unitCost}-${row.salePrice}`}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>{row.date}</TableCell>
                <TableCell>{row.size}</TableCell>
                <TableCell>{row.color}</TableCell>
                <TableCell>{row.type}</TableCell>
                <TableCell align="right">{formatKs(row.unitCost)}</TableCell>
                <TableCell align="right">{formatKs(row.salePrice)}</TableCell>
                <TableCell align="right">{row.adjustedQty}</TableCell>
                <TableCell align="right">{row.sold}</TableCell>
                <TableCell align="right">
                  <Chip size="small" label={row.available} color={getStockTone(row.available)} variant="outlined" />
                </TableCell>
                <TableCell align="right">{formatKs(row.deli)}</TableCell>
                <TableCell>
                  <Box className="table-actions">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setAdjustDraft({
                          action: 'ADD',
                          quantity: 1,
                          date: getToday(),
                          reason: '',
                        })
                        setAdjustTarget(row)
                      }}
                    >
                      Adjust
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      variant="outlined"
                      startIcon={<DeleteOutlineRoundedIcon />}
                      onClick={() => deleteStock(row)}
                    >
                      Delete
                    </Button>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length ? (
              <TableRow>
                <TableCell colSpan={12} align="center">
                  No stock records
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={stockDialogOpen} onClose={() => setStockDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Add Stock</DialogTitle>
        <DialogContent dividers>
          <Box className="form-grid" sx={{ pt: 1 }}>
            <TextField
              className="span-6"
              type="date"
              label="Received Date"
              value={stockForm.date}
              onChange={(event) => setStockForm((current) => ({ ...current, date: event.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }}
              required
            />
            <TextField
              className="span-6"
              type="number"
              label="Delivery Cost"
              value={stockForm.deli}
              onChange={(event) => setStockForm((current) => ({ ...current, deli: event.target.value }))}
              slotProps={{ htmlInput: { min: 0 } }}
            />
            <FormControl className="span-6">
              <InputLabel>Size</InputLabel>
              <Select
                label="Size"
                value={stockForm.size}
                onChange={(event) => setStockForm((current) => ({ ...current, size: event.target.value }))}
              >
                {SIZE_OPTIONS.map((size) => (
                  <MenuItem key={size} value={size}>
                    {size}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl className="span-6">
              <InputLabel>Color</InputLabel>
              <Select
                label="Color"
                value={stockForm.color}
                onChange={(event) => setStockForm((current) => ({ ...current, color: event.target.value }))}
              >
                {state.productColors.map((color) => (
                  <MenuItem key={color} value={color}>
                    {color}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl className="span-6">
              <InputLabel>Type</InputLabel>
              <Select
                label="Type"
                value={stockForm.type}
                onChange={(event) => setStockForm((current) => ({ ...current, type: event.target.value }))}
              >
                {state.productTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              className="span-6"
              type="number"
              label="Unit Cost"
              value={stockForm.unitCost}
              onChange={(event) => setStockForm((current) => ({ ...current, unitCost: event.target.value }))}
              slotProps={{ htmlInput: { min: 0 } }}
              required
            />
            <TextField
              className="span-6"
              type="number"
              label="Sale Price"
              value={stockForm.salePrice}
              onChange={(event) => setStockForm((current) => ({ ...current, salePrice: event.target.value }))}
              slotProps={{ htmlInput: { min: 0 } }}
              required
            />
            <TextField
              className="span-12"
              type="number"
              label="Quantity"
              value={stockForm.quantity}
              onChange={(event) => setStockForm((current) => ({ ...current, quantity: event.target.value }))}
              slotProps={{ htmlInput: { min: 1 } }}
              required
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStockDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={saveStock}>
            Save Stock
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        fullScreen={mobile}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Stock settings</DialogTitle>
        <DialogContent dividers>
          <Box className="catalog-settings-grid">
            <CatalogSection
              title="Product Types"
              inputLabel="Add product type"
              value={newType}
              onChange={setNewType}
              onAdd={addType}
              items={state.productTypes}
              usage={catalogUsage.types}
              onDelete={deleteType}
            />
            <CatalogSection
              title="Product Colors"
              inputLabel="Add product color"
              value={newColor}
              onChange={setNewColor}
              onAdd={addColor}
              items={state.productColors}
              usage={catalogUsage.colors}
              onDelete={deleteColor}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>Done</Button>
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
      <Dialog
        open={Boolean(adjustTarget)}
        onClose={() => setAdjustTarget(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Adjust stock</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">
              Every adjustment records the before/after quantity, reason, date, and audit event.
            </Alert>
            <FormControl>
              <InputLabel>Action</InputLabel>
              <Select
                label="Action"
                value={adjustDraft.action}
                onChange={(event) =>
                  setAdjustDraft((current) => ({ ...current, action: event.target.value }))
                }
              >
                <MenuItem value="ADD">Add stock</MenuItem>
                <MenuItem value="SUB">Remove stock</MenuItem>
              </Select>
            </FormControl>
            <TextField
              type="number"
              label="Quantity"
              value={adjustDraft.quantity}
              onChange={(event) =>
                setAdjustDraft((current) => ({ ...current, quantity: event.target.value }))
              }
              slotProps={{ htmlInput: { min: 1 } }}
            />
            <TextField
              type="date"
              label="Adjustment date"
              value={adjustDraft.date}
              onChange={(event) =>
                setAdjustDraft((current) => ({ ...current, date: event.target.value }))
              }
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Reason"
              value={adjustDraft.reason}
              onChange={(event) =>
                setAdjustDraft((current) => ({ ...current, reason: event.target.value }))
              }
              multiline
              minRows={3}
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjustTarget(null)} disabled={confirmBusy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={saveAdjustment} disabled={confirmBusy}>
            {confirmBusy ? 'Saving…' : 'Save adjustment'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function CatalogSection({ title, inputLabel, value, onChange, onAdd, items, usage, onDelete }) {
  return (
    <Paper variant="outlined" className="catalog-settings-section">
      <Typography variant="h6">{title}</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ mt: 2 }}>
        <TextField
          label={inputLabel}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          size="small"
          fullWidth
        />
        <Button variant="contained" onClick={onAdd}>
          Add
        </Button>
      </Stack>
      <Stack spacing={1} sx={{ mt: 2 }}>
        {items.map((item) => (
          <Box key={item} className="catalog-setting-row">
            <Box>
              <Typography fontWeight={800}>{item}</Typography>
              <Typography variant="caption" color="text.secondary">
                Used in {usage[item] || 0} record(s)
              </Typography>
            </Box>
            <Button
              size="small"
              color="error"
              startIcon={<DeleteOutlineRoundedIcon />}
              disabled={Boolean(usage[item])}
              onClick={() => onDelete(item)}
            >
              Delete
            </Button>
          </Box>
        ))}
        {!items.length ? (
          <Box className="empty-state compact">
            <Typography color="text.secondary">No items configured.</Typography>
          </Box>
        ) : null}
      </Stack>
    </Paper>
  )
}

function MobileDetail({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography fontWeight={800}>{value}</Typography>
    </Box>
  )
}
