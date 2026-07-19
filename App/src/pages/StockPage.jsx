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
  createProductDocument,
  createStockBatch,
  createVariantDocument,
  deleteStockBatch,
  deleteVariantDocument,
  updateProductDocument,
  updateVariantDocument,
} from '../services/shopApiService.js'
import { useFeedback } from '../contexts/FeedbackContext.jsx'
import {
  buildStockState,
  formatKs,
  getToday,
  getItemVariantKey,
  getVariantKey,
} from '../utils/storage.js'
import {
  catalogLabels,
  createOptionId,
  MAX_OPTION_LEVELS,
  normalizeCatalogSettings,
  optionPathFromValueIds,
  optionPathMatchesValueIds,
  optionValuesForLevel,
  normalizeOptionPath,
  normalizeOptionTree,
  valueIdsFromOptionPath,
  variantDisplayName,
  variantOptionValue,
} from '../utils/catalog.js'
import useSessionState from '../hooks/useSessionState.js'

const emptyStockForm = {
  date: getToday(),
  deli: 0,
  productId: '',
  variantId: '',
  optionValueIds: [],
  optionPath: [],
  variantName: '',
  size: 'Standard',
  color: '',
  type: '',
  unitCost: '',
  salePrice: '',
  quantity: 1,
}

function getSold(state, row, from = null, to = null) {
  const list = state.soldQtyMap[getItemVariantKey(row)] || []
  return list.reduce((sum, item) => {
    if (from && item.date < from) return sum
    if (to && item.date > to) return sum
    return sum + item.qty
  }, 0)
}

function getAdjustmentQty(state, action, row, from = null, to = null) {
  const list = state.adjustmentMap[getItemVariantKey(row)] || []
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
    const key = `${stock.date || '-'}__${stock.variantId || getVariantKey(stock.size, stock.color, stock.type)}__${unitCost}__${salePrice}`

    if (!grouped[key]) {
      grouped[key] = {
        date: stock.date || '-',
        productId: stock.productId,
        variantId: stock.variantId,
        variantName: stock.variantName,
        optionPath: stock.optionPath || [],
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
    const itemKey = getItemVariantKey(row)
    if (!itemBuckets[itemKey]) itemBuckets[itemKey] = []
    itemBuckets[itemKey].push(row)
  })

  const rows = []

  Object.values(itemBuckets).forEach((bucket) => {
    bucket.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

    const base = bucket[0]
    let remainingSold = getSold(state, base, from, to)
    let remainingAdj =
      getAdjustmentQty(state, 'ADD', base, from, to) -
      getAdjustmentQty(state, 'SUB', base, from, to)

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

export default function StockPage({ refresh, requireAuth = () => false }) {
  const { user } = useAuth()
  const { data } = useData()
  const { notify } = useFeedback()
  const state = useMemo(() => buildStockState(data), [data])
  const catalog = useMemo(() => normalizeCatalogSettings(data.catalogSettings), [data.catalogSettings])
  const labels = useMemo(() => catalogLabels(catalog), [catalog])
  const option1Values = data.option1Values?.length ? data.option1Values : catalog.option1Values
  const option2Values = data.option2Values?.length ? data.option2Values : catalog.option2Values
  const mobile = useMediaQuery('(max-width:767px)')
  const [productDraft, setProductDraft] = useState({
    id: '',
    name: '',
    price: 0,
    cost: 0,
    optionTree: normalizeOptionTree(),
  })
  const [variantDraft, setVariantDraft] = useState({
    id: '',
    optionValueIds: [],
    price: '',
    cost: '',
  })
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [stockBusy, setStockBusy] = useState(false)
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
  const activeProducts = useMemo(
    () => (data.products || []).filter((product) => product.isActive !== false),
    [data.products],
  )
  const selectedStockProduct = useMemo(
    () => activeProducts.find((product) => String(product.id) === String(stockForm.productId)) || null,
    [activeProducts, stockForm.productId],
  )
  const selectedStockTree = useMemo(
    () => normalizeOptionTree(selectedStockProduct?.optionTree),
    [selectedStockProduct],
  )
  const stockVariants = useMemo(
    () => (selectedStockProduct?.variants || []).filter((variant) => variant.isActive !== false),
    [selectedStockProduct],
  )
  const selectedStockVariant = useMemo(
    () => stockVariants.find((variant) => String(variant.id) === String(stockForm.variantId)) || null,
    [stockForm.variantId, stockVariants],
  )
  const currentVariantStock = useMemo(
    () =>
      data.stocks
        .filter((stock) => getItemVariantKey(stock) === getItemVariantKey(stockForm))
        .reduce((sum, stock) => sum + Number(stock.quantity || 0), 0),
    [data.stocks, stockForm],
  )
  const addQuantity = Number(stockForm.quantity || 0)
  const newVariantStock = currentVariantStock + Math.max(0, addQuantity)
  const settingsProduct = useMemo(
    () => activeProducts.find((product) => String(product.id) === String(productDraft.id)) || null,
    [activeProducts, productDraft.id],
  )
  const settingsTree = useMemo(() => normalizeOptionTree(productDraft.optionTree), [productDraft.optionTree])
  const handleExportStockPDF = async () => {
    const { exportStockPDF } = await import('../utils/reports.js')
    exportStockPDF(rows, totals, catalog)
  }

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const valuesForSelection = (tree, levelIndex, selectedIds = []) =>
    optionValuesForLevel(tree, levelIndex, levelIndex === 0 ? null : selectedIds[levelIndex - 1])

  const findVariantByValueIds = (variants, valueIds = [], levelCount = 0) =>
    variants.find((variant) => optionPathMatchesValueIds(variant.optionPath, valueIds.slice(0, levelCount))) || null

  const stockFieldsFromProductVariant = (product, variant = null) => ({
    productId: product?.id || '',
    variantId: variant?.id || '',
    optionValueIds: valueIdsFromOptionPath(variant?.optionPath),
    type: product?.name || '',
    size: variantOptionValue(variant, 0, 'Default'),
    color: variantOptionValue(variant, 1, '-'),
    variantName: variant ? variantDisplayName(variant) : '',
    optionPath: variant?.optionPath || [],
    salePrice: Number(variant?.price ?? product?.price ?? 0) || '',
    unitCost: Number(variant?.cost ?? product?.cost ?? 0) || '',
  })

  const stockFieldsFromProductPath = (product, valueIds = []) => {
    const tree = normalizeOptionTree(product?.optionTree)
    const path = optionPathFromValueIds(tree, valueIds)
    const variant = path.length === tree.levels.length
      ? findVariantByValueIds((product?.variants || []).filter((entry) => entry.isActive !== false), valueIds, tree.levels.length)
      : null
    return {
      ...stockFieldsFromProductVariant(product, variant),
      optionValueIds: valueIds,
      optionPath: variant?.optionPath || path,
    }
  }

  const updateStockProduct = (productId) => {
    const product = activeProducts.find((entry) => String(entry.id) === String(productId))
    const variant = (product?.variants || []).find((entry) => entry.isActive !== false) || null
    setStockForm((current) => ({ ...current, ...stockFieldsFromProductVariant(product, variant) }))
  }

  const updateStockOption = (levelIndex, valueId) => {
    setStockForm((current) => {
      const nextIds = current.optionValueIds.slice(0, levelIndex)
      if (valueId) nextIds[levelIndex] = valueId
      return {
        ...current,
        ...stockFieldsFromProductPath(selectedStockProduct, nextIds),
      }
    })
  }

  const loadProductDraft = (product) => {
    setProductDraft({
      id: product?.id || '',
      name: product?.name || '',
      price: Number(product?.price || 0),
      cost: Number(product?.cost || 0),
      optionTree: normalizeOptionTree(product?.optionTree),
    })
    const firstVariant = (product?.variants || []).find((variant) => variant.isActive !== false)
    setVariantDraft({
      id: firstVariant?.id || '',
      optionValueIds: valueIdsFromOptionPath(firstVariant?.optionPath),
      price: firstVariant?.price ?? '',
      cost: firstVariant?.cost ?? '',
    })
  }

  const openStockDialog = () => {
    if (requireAuth()) return

    const product = activeProducts[0] || null
    const variant = (product?.variants || []).find((entry) => entry.isActive !== false) || null
    setStockForm({
      ...emptyStockForm,
      ...stockFieldsFromProductVariant(product, variant),
    })
    setStockDialogOpen(true)
  }

  const updateOptionLevelLabel = (levelIndex, label) => {
    setProductDraft((current) => {
      const tree = normalizeOptionTree(current.optionTree)
      const levels = [...tree.levels]
      levels[levelIndex] = {
        id: levels[levelIndex]?.id || `level-${levelIndex + 1}`,
        level: levelIndex,
        label,
      }
      return { ...current, optionTree: { ...tree, levels: levels.slice(0, Math.max(levelIndex + 1, levels.length)) } }
    })
  }

  const addOptionLevel = () => {
    setProductDraft((current) => {
      const tree = normalizeOptionTree(current.optionTree)
      if (tree.levels.length >= MAX_OPTION_LEVELS) return current
      const nextIndex = tree.levels.length
      return {
        ...current,
        optionTree: {
          ...tree,
          levels: [...tree.levels, { id: `level-${nextIndex + 1}`, label: `Option ${nextIndex + 1}`, level: nextIndex }],
        },
      }
    })
  }

  const removeOptionLevel = () => {
    setProductDraft((current) => {
      const tree = normalizeOptionTree(current.optionTree)
      if (!tree.levels.length) return current
      const nextLevelCount = tree.levels.length - 1
      return {
        ...current,
        optionTree: {
          levels: tree.levels.slice(0, nextLevelCount),
          values: tree.values.filter((value) => value.level < nextLevelCount),
        },
      }
    })
  }

  const addOptionValue = (level, parentId = null) => {
    setProductDraft((current) => {
      const tree = normalizeOptionTree(current.optionTree)
      const label = `Value ${tree.values.filter((value) => value.level === level).length + 1}`
      return {
        ...current,
        optionTree: {
          ...tree,
          values: [
            ...tree.values,
            {
              id: createOptionId(level === 0 ? 'parent' : 'child'),
              label,
              level,
              parentId: level === 0 ? null : parentId,
            },
          ],
        },
      }
    })
  }

  const updateOptionValue = (valueId, label) => {
    setProductDraft((current) => {
      const tree = normalizeOptionTree(current.optionTree)
      return {
        ...current,
        optionTree: {
          ...tree,
          values: tree.values.map((value) => (value.id === valueId ? { ...value, label } : value)),
        },
      }
    })
  }

  const removeOptionValue = (valueId) => {
    setProductDraft((current) => {
      const tree = normalizeOptionTree(current.optionTree)
      const removeIds = new Set([valueId])
      let changed = true
      while (changed) {
        changed = false
        tree.values.forEach((value) => {
          if (value.parentId && removeIds.has(value.parentId) && !removeIds.has(value.id)) {
            removeIds.add(value.id)
            changed = true
          }
        })
      }
      return {
        ...current,
        optionTree: {
          ...tree,
          values: tree.values.filter((value) => !removeIds.has(value.id)),
        },
      }
    })
  }

  const saveProductDraft = async () => {
    if (requireAuth()) return
    if (!productDraft.name.trim()) {
      notify('Product name is required.', 'warning')
      return
    }

    setSettingsBusy(true)
    try {
      if (productDraft.id) {
        await updateProductDocument(user.uid, productDraft.id, productDraft)
        notify('Product settings saved.')
      } else {
        const result = await createProductDocument(user.uid, productDraft)
        notify('Product created.')
        loadProductDraft(result.product)
      }
      refresh()
    } catch (error) {
      notify(error.message || 'Product settings could not be saved.', 'error')
    } finally {
      setSettingsBusy(false)
    }
  }

  const variantPathFromDraft = () => {
    const tree = normalizeOptionTree(productDraft.optionTree)
    if (tree.levels.length === 0) return []
    return optionPathFromValueIds(tree, variantDraft.optionValueIds)
  }

  const saveVariantDraft = async () => {
    if (requireAuth()) return
    if (!productDraft.id) {
      notify('Save the product before adding variants.', 'warning')
      return
    }

    const optionPath = variantPathFromDraft()
    if (settingsTree.levels.length && optionPath.length !== settingsTree.levels.length) {
      notify('Choose a valid final variant path.', 'warning')
      return
    }

    setSettingsBusy(true)
    try {
      const payload = {
        name: optionPath.length ? optionPath.map((entry) => entry.value).join(' / ') : 'Default',
        price: Number(variantDraft.price || productDraft.price || 0),
        cost: Number(variantDraft.cost || productDraft.cost || 0),
        optionPath,
        isActive: true,
      }
      if (variantDraft.id) {
        await updateVariantDocument(user.uid, productDraft.id, variantDraft.id, payload)
        notify('Variant saved.')
      } else {
        await createVariantDocument(user.uid, productDraft.id, payload)
        notify('Variant added.')
      }
      setVariantDraft({ id: '', optionValueIds: [], price: '', cost: '' })
      refresh()
    } catch (error) {
      notify(error.message || 'Variant could not be saved.', 'error')
    } finally {
      setSettingsBusy(false)
    }
  }

  const editVariant = (variant) => {
    const path = normalizeOptionPath(variant.optionPath)
    setVariantDraft({
      id: variant.id,
      optionValueIds: valueIdsFromOptionPath(path),
      price: variant.price ?? '',
      cost: variant.cost ?? '',
    })
  }

  const deleteVariant = async (variant) => {
    if (requireAuth()) return
    setConfirmAction({
      title: 'Archive variant?',
      message: 'Used variants are archived to preserve stock and order history. Unused variants may be removed by the API.',
      run: async () => {
        await deleteVariantDocument(user.uid, productDraft.id, variant.id)
        notify('Variant updated.')
        refresh()
      },
    })
  }

  const saveStock = async () => {
    if (requireAuth()) return

    if (stockBusy) return

    if (!stockForm.productId || !stockForm.date || stockForm.unitCost === '' || stockForm.salePrice === '' || !stockForm.quantity) {
      notify('Product, date, cost, sale price, and quantity are required.', 'warning')
      return
    }

    if (selectedStockTree.levels.length > 0 && !stockForm.variantId) {
      notify('Choose a valid final variant before saving stock.', 'warning')
      return
    }

    if (Number(stockForm.quantity || 0) <= 0) {
      notify('Quantity must be greater than zero.', 'warning')
      return
    }

    setStockBusy(true)
    try {
      await createStockBatch(user.uid, {
        productId: stockForm.productId,
        variantId: stockForm.variantId || undefined,
        variantName: stockForm.variantName,
        optionPath: stockForm.optionPath,
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
    } finally {
      setStockBusy(false)
    }
  }

  const deleteStock = async (row) => {
    if (requireAuth()) return

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
    if (requireAuth()) return

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
        subtitle={`Manage ${labels.productPlural.toLowerCase()}, variants, stock batches, sold quantities, and stock value.`}
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={<SettingsRoundedIcon />}
              onClick={() => {
                loadProductDraft(activeProducts[0] || null)
                setSettingsOpen(true)
              }}
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
            <InputLabel>{labels.product}</InputLabel>
            <Select label={labels.product} value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}>
              <MenuItem value="">{labels.allProducts}</MenuItem>
              {state.productTypes.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" className="span-3">
            <InputLabel>{labels.option1}</InputLabel>
            <Select label={labels.option1} value={filters.size} onChange={(event) => updateFilter('size', event.target.value)}>
              <MenuItem value="">{labels.allOption1}</MenuItem>
              {option1Values.map((size) => (
                <MenuItem key={size} value={size}>
                  {size}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" className="span-3">
            <InputLabel>{labels.option2}</InputLabel>
            <Select label={labels.option2} value={filters.color} onChange={(event) => updateFilter('color', event.target.value)}>
              <MenuItem value="">{labels.allOption2}</MenuItem>
              {option2Values.map((color) => (
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
                  {row.size} - {row.color} - {row.date}
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
              <TableCell>{labels.option1}</TableCell>
              <TableCell>{labels.option2}</TableCell>
              <TableCell>{labels.product}</TableCell>
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
              <InputLabel>{labels.product}</InputLabel>
              <Select
                label={labels.product}
                value={stockForm.productId}
                onChange={(event) => updateStockProduct(event.target.value)}
              >
                {activeProducts.map((product) => (
                  <MenuItem key={product.id} value={product.id}>
                    {product.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {selectedStockTree.levels.length > 0 ? (
              <>
                {selectedStockTree.levels.map((level, levelIndex) => {
                  const options = valuesForSelection(selectedStockTree, levelIndex, stockForm.optionValueIds)
                  const disabled = levelIndex > 0 && !stockForm.optionValueIds[levelIndex - 1]
                  return (
                    <FormControl key={level.id} className="span-6" disabled={disabled}>
                      <InputLabel>{level.label}</InputLabel>
                      <Select
                        label={level.label}
                        value={stockForm.optionValueIds[levelIndex] || ''}
                        onChange={(event) => updateStockOption(levelIndex, event.target.value)}
                      >
                        {options.map((value) => (
                          <MenuItem key={value.id} value={value.id}>
                            {value.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )
                })}
                <TextField
                  className="span-6"
                  label="Final variant"
                  value={selectedStockVariant ? variantDisplayName(selectedStockVariant) : ''}
                  disabled
                />
              </>
            ) : null}
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
              className="span-6"
              type="number"
              label="Quantity"
              value={stockForm.quantity}
              onChange={(event) => setStockForm((current) => ({ ...current, quantity: event.target.value }))}
              slotProps={{ htmlInput: { min: 1 } }}
              required
            />
            <Alert severity={selectedStockVariant || stockVariants.length === 0 ? 'info' : 'warning'} className="span-6">
              Current stock: {currentVariantStock} - Add: {Math.max(0, addQuantity)} - New total: {newVariantStock}
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStockDialogOpen(false)} disabled={stockBusy}>Cancel</Button>
          <Button variant="contained" color="success" onClick={saveStock} disabled={stockBusy}>
            {stockBusy ? 'Saving...' : 'Save Stock'}
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
          <Paper variant="outlined" className="catalog-settings-section">
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ justifyContent: 'space-between' }}>
              <Typography variant="h6">Product stock options</Typography>
              <Button
                variant="outlined"
                onClick={() => loadProductDraft(null)}
              >
                New product
              </Button>
            </Stack>
            <Box className="form-grid" sx={{ mt: 2 }}>
              <FormControl className="span-4">
                <InputLabel>{labels.product}</InputLabel>
                <Select
                  label={labels.product}
                  value={productDraft.id}
                  onChange={(event) => {
                    const product = activeProducts.find((entry) => String(entry.id) === String(event.target.value))
                    loadProductDraft(product)
                  }}
                >
                  <MenuItem value="">New product</MenuItem>
                  {activeProducts.map((product) => (
                    <MenuItem key={product.id} value={product.id}>
                      {product.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                className="span-8"
                label="Product name"
                value={productDraft.name}
                onChange={(event) => setProductDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </Box>
            <Stack direction="row" gap={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
              <Button variant="contained" onClick={saveProductDraft} disabled={settingsBusy}>
                Save product
              </Button>
              <Button variant="outlined" onClick={addOptionLevel} disabled={settingsTree.levels.length >= MAX_OPTION_LEVELS || settingsBusy}>
                Add option level
              </Button>
              <Button color="error" variant="outlined" onClick={removeOptionLevel} disabled={!settingsTree.levels.length || settingsBusy}>
                Remove last option level
              </Button>
            </Stack>

            {settingsTree.levels.map((level, levelIndex) => (
              <Paper key={level.id} variant="outlined" sx={{ p: 2, mt: 2 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ alignItems: { sm: 'center' } }}>
                  <TextField
                    label={`Option ${levelIndex + 1} label`}
                    value={level.label}
                    onChange={(event) => updateOptionLevelLabel(levelIndex, event.target.value)}
                    size="small"
                  />
                  <Button
                    variant="outlined"
                    onClick={() => {
                      const parent = levelIndex === 0 ? null : optionValuesForLevel(settingsTree, levelIndex - 1)[0]?.id || null
                      addOptionValue(levelIndex, parent)
                    }}
                    disabled={levelIndex > 0 && optionValuesForLevel(settingsTree, levelIndex - 1).length === 0}
                  >
                    Add value
                  </Button>
                </Stack>
                <Stack spacing={1} sx={{ mt: 2 }}>
                  {settingsTree.values
                    .filter((value) => value.level === levelIndex)
                    .map((value) => (
                      <Box key={value.id} className="catalog-setting-row">
                        <TextField
                          size="small"
                          label={level.label}
                          value={value.label}
                          onChange={(event) => updateOptionValue(value.id, event.target.value)}
                        />
                        {levelIndex > 0 ? (
                          <FormControl size="small" sx={{ minWidth: 180 }}>
                            <InputLabel>Parent</InputLabel>
                            <Select
                              label="Parent"
                              value={value.parentId || ''}
                              onChange={(event) =>
                                setProductDraft((current) => {
                                  const tree = normalizeOptionTree(current.optionTree)
                                  return {
                                    ...current,
                                    optionTree: {
                                      ...tree,
                                      values: tree.values.map((entry) =>
                                        entry.id === value.id ? { ...entry, parentId: event.target.value } : entry,
                                      ),
                                    },
                                  }
                                })
                              }
                            >
                              {optionValuesForLevel(settingsTree, levelIndex - 1).map((parent) => (
                                <MenuItem key={parent.id} value={parent.id}>
                                  {parent.label}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        ) : null}
                        <Button color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => removeOptionValue(value.id)}>
                          Remove
                        </Button>
                      </Box>
                    ))}
                </Stack>
              </Paper>
            ))}

            {settingsTree.levels.length > 0 ? (
            <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
              <Typography variant="h6">Product variants</Typography>
              <Box className="form-grid" sx={{ mt: 2 }}>
                {settingsTree.levels.map((level, levelIndex) => {
                  const options = valuesForSelection(settingsTree, levelIndex, variantDraft.optionValueIds)
                  const disabled = levelIndex > 0 && !variantDraft.optionValueIds[levelIndex - 1]
                  return (
                    <FormControl key={level.id} className="span-3" disabled={disabled}>
                      <InputLabel>{level.label}</InputLabel>
                      <Select
                        label={level.label}
                        value={variantDraft.optionValueIds[levelIndex] || ''}
                        onChange={(event) =>
                          setVariantDraft((current) => {
                            const nextIds = current.optionValueIds.slice(0, levelIndex)
                            if (event.target.value) nextIds[levelIndex] = event.target.value
                            return { ...current, optionValueIds: nextIds }
                          })
                        }
                      >
                        {options.map((value) => (
                          <MenuItem key={value.id} value={value.id}>
                            {value.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )
                })}
              </Box>
              <Stack direction="row" gap={1} sx={{ mt: 2 }}>
                <Button variant="contained" onClick={saveVariantDraft} disabled={settingsBusy || !productDraft.id}>
                  {variantDraft.id ? 'Save variant' : 'Add variant'}
                </Button>
                {variantDraft.id ? (
                  <Button variant="outlined" onClick={() => setVariantDraft({ id: '', optionValueIds: [], price: '', cost: '' })}>
                    Clear
                  </Button>
                ) : null}
              </Stack>
              <Stack spacing={1} sx={{ mt: 2 }}>
                {(settingsProduct?.variants || []).map((variant) => (
                  <Box key={variant.id} className="catalog-setting-row">
                    <Box>
                      <Typography fontWeight={800}>{variantDisplayName(variant)}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Price {formatKs(variant.price ?? productDraft.price)} - Cost {formatKs(variant.cost ?? productDraft.cost)}
                      </Typography>
                    </Box>
                    <Stack direction="row" gap={1}>
                      <Button size="small" variant="outlined" onClick={() => editVariant(variant)}>
                        Edit
                      </Button>
                      <Button size="small" color="error" variant="outlined" onClick={() => deleteVariant(variant)}>
                        Archive
                      </Button>
                    </Stack>
                  </Box>
                ))}
                {productDraft.id && !(settingsProduct?.variants || []).length ? (
                  <Box className="empty-state compact">
                    <Typography color="text.secondary">No variants added yet.</Typography>
                  </Box>
                ) : null}
              </Stack>
            </Paper>
            ) : null}
          </Paper>
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
            {confirmBusy ? 'Saving...' : 'Save adjustment'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
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
