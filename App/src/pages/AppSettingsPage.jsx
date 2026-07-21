import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import PageHeader from '../components/PageHeader.jsx'
import SectionCard from '../components/SectionCard.jsx'
import EmptyState from '../components/EmptyState.jsx'
import StatusChip from '../components/StatusChip.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useData } from '../contexts/DataContext.jsx'
import { useFeedback } from '../contexts/FeedbackContext.jsx'
import {
  createProductDocument,
  deleteProductDocument,
  savePaymentMethods,
  updateProductDocument,
} from '../services/shopApiService.js'
import {
  MAX_OPTION_LEVELS,
  createOptionId,
  createSlugId,
  normalizeCatalogSettings,
  normalizeOptionTree,
  normalizePaymentMethods,
  optionValuesForLevel,
  valueIdsFromOptionPath,
} from '../utils/catalog.js'

function emptyProductDraft() {
  return {
    id: null,
    name: '',
    price: '',
    cost: '',
    optionTree: { levels: [], values: [] },
    variants: [],
  }
}

function nextSortOrder(methods) {
  return methods.reduce((max, method) => Math.max(max, Number(method.sortOrder || 0)), -1) + 1
}

function paymentDraft() {
  return { name: '', type: 'normal' }
}

export default function AppSettingsPage({ refresh, requireAuth }) {
  const { user } = useAuth()
  const { data } = useData()
  const { notify } = useFeedback()
  const settings = useMemo(() => normalizeCatalogSettings(data.catalogSettings), [data.catalogSettings])
  const [productDraft, setProductDraft] = useState(emptyProductDraft)
  const [selectedValueIds, setSelectedValueIds] = useState([])
  const [valueDrafts, setValueDrafts] = useState({})
  const [methodDraft, setMethodDraft] = useState(paymentDraft)
  const [paymentMethods, setPaymentMethods] = useState(() => settings.paymentMethods)
  const [saving, setSaving] = useState(false)

  const tree = normalizeOptionTree(productDraft.optionTree)

  const loadProduct = (product) => {
    const normalized = {
      ...product,
      price: product.price ?? '',
      cost: product.cost ?? '',
      optionTree: normalizeOptionTree(product.optionTree),
      variants: product.variants || [],
    }
    setProductDraft(normalized)
    setSelectedValueIds([])
  }

  const resetProduct = () => {
    setProductDraft(emptyProductDraft())
    setSelectedValueIds([])
    setValueDrafts({})
  }

  const updateLevelLabel = (index, label) => {
    setProductDraft((current) => {
      const levels = [...current.optionTree.levels]
      levels[index] = { ...levels[index], label }
      return { ...current, optionTree: { ...current.optionTree, levels } }
    })
  }

  const addLevel = () => {
    if (tree.levels.length >= MAX_OPTION_LEVELS) return
    setProductDraft((current) => ({
      ...current,
      optionTree: {
        ...current.optionTree,
        levels: [
          ...current.optionTree.levels,
          { id: createOptionId('level'), label: '' },
        ],
      },
    }))
  }

  const removeLevel = (index) => {
    if (index < 0 || index >= tree.levels.length) return
    const nextDepth = index
    setProductDraft((current) => ({
      ...current,
      optionTree: {
        levels: current.optionTree.levels.slice(0, nextDepth),
        values: current.optionTree.values.filter((value) => value.level < nextDepth),
      },
      variants: [],
    }))
    setSelectedValueIds((current) => current.slice(0, nextDepth))
  }

  const updateValueDraft = (levelId, value) => {
    setValueDrafts((current) => ({ ...current, [levelId]: value }))
  }

  const selectValue = (levelIndex, valueId) => {
    setSelectedValueIds((current) => [
      ...current.slice(0, levelIndex),
      valueId,
    ])
  }

  const addValue = (levelIndex) => {
    const level = tree.levels[levelIndex]
    if (!level?.label.trim()) {
      notify('Enter the option name first.', 'warning')
      return
    }
    const trimmed = String(valueDrafts[level?.id] || '').trim()
    if (!trimmed) return
    const duplicate = optionValuesForLevel(tree, levelIndex)
      .some((value) => value.label.trim().toLowerCase() === trimmed.toLowerCase())
    if (duplicate) {
      notify('This value already exists in this option group.', 'warning')
      return
    }
    const valueId = createOptionId('value')
    setProductDraft((current) => ({
      ...current,
      optionTree: {
        ...current.optionTree,
        values: [
          ...current.optionTree.values,
          {
            id: valueId,
            label: trimmed,
            level: levelIndex,
            parentId: null,
          },
        ],
      },
    }))
    setSelectedValueIds((current) => [
      ...current.slice(0, levelIndex),
      valueId,
    ])
    setValueDrafts((current) => ({ ...current, [level.id]: '' }))
  }

  const renameValue = (valueId) => {
    const currentValue = tree.values.find((value) => value.id === valueId)
    if (!currentValue) return
    const label = window.prompt('Edit option value', currentValue.label)
    const trimmed = String(label || '').trim()
    if (!trimmed) return
    setProductDraft((current) => ({
      ...current,
      optionTree: {
        ...current.optionTree,
        values: current.optionTree.values.map((value) =>
          value.id === valueId ? { ...value, label: trimmed } : value,
        ),
      },
    }))
  }

  const removeValue = (valueId) => {
    const blockedByVariant = productDraft.variants.some((variant) =>
      valueIdsFromOptionPath(variant.optionPath).includes(valueId),
    )
    if (blockedByVariant) {
      notify('This value is used by an existing variant. Archive/remove the variant first.', 'warning')
      return
    }
    const removeIds = new Set([valueId])
    setProductDraft((current) => ({
      ...current,
      optionTree: {
        ...current.optionTree,
        values: current.optionTree.values.filter((value) => !removeIds.has(value.id)),
      },
    }))
    setSelectedValueIds((current) => current.filter((id) => !removeIds.has(id)))
  }

  const saveProduct = async () => {
    if (requireAuth?.('save product settings')) return
    if (!productDraft.name.trim()) {
      notify('Product name is required.', 'warning')
      return
    }
    const emptyOptionIndex = tree.levels.findIndex((level) => !level.label.trim())
    if (emptyOptionIndex >= 0) {
      notify(`Option ${emptyOptionIndex + 1} name is required.`, 'warning')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: productDraft.name.trim(),
        price: Number(productDraft.price || 0),
        cost: Number(productDraft.cost || 0),
        optionTree: tree,
      }
      const result = productDraft.id
        ? await updateProductDocument(user.uid, productDraft.id, payload)
        : await createProductDocument(user.uid, payload)
      const savedProduct = result.product || result
      notify('Product settings saved.')
      await refresh()
      setProductDraft({
        ...savedProduct,
        price: savedProduct.price ?? '',
        cost: savedProduct.cost ?? '',
        optionTree: normalizeOptionTree(savedProduct.optionTree),
        variants: savedProduct.variants || productDraft.variants || [],
      })
    } catch (error) {
      notify(error.message || 'Product settings could not be saved.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const removeProduct = async () => {
    if (requireAuth?.('remove product')) return
    if (!productDraft.id) return
    const confirmed = window.confirm('Remove this product from active selling? Stock must be fully sold or reserved. Existing stock and sales records will stay readable.')
    if (!confirmed) return
    setSaving(true)
    try {
      await deleteProductDocument(user.uid, productDraft.id)
      notify('Product removed from active selling.')
      resetProduct()
      await refresh()
    } catch (error) {
      notify(error.message || 'Product could not be removed.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const addPaymentMethod = () => {
    const name = methodDraft.name.trim()
    if (!name) return
    if (paymentMethods.some((method) => method.name.toLowerCase() === name.toLowerCase())) {
      notify('This payment method already exists.', 'warning')
      return
    }
    setPaymentMethods((current) => [
      ...current,
      {
        id: createSlugId(name, 'method'),
        name,
        type: methodDraft.type,
        active: true,
        sortOrder: nextSortOrder(current),
      },
    ])
    setMethodDraft(paymentDraft())
  }

  const updatePaymentMethod = (id, updates) => {
    setPaymentMethods((current) =>
      normalizePaymentMethods(current.map((method) => (method.id === id ? { ...method, ...updates } : method))),
    )
  }

  const removePaymentMethod = (id) => {
    setPaymentMethods((current) => current.filter((method) => method.id !== id))
  }

  const movePaymentMethod = (id, direction) => {
    setPaymentMethods((current) => {
      const sorted = [...current].sort((a, b) => a.sortOrder - b.sortOrder)
      const index = sorted.findIndex((method) => method.id === id)
      const swapIndex = index + direction
      if (index < 0 || swapIndex < 0 || swapIndex >= sorted.length) return current
      const next = [...sorted]
      const temp = next[index]
      next[index] = next[swapIndex]
      next[swapIndex] = temp
      return next.map((method, sortOrder) => ({ ...method, sortOrder }))
    })
  }

  const saveMethods = async () => {
    if (requireAuth?.('save payment methods')) return
    const normalizedMethods = normalizePaymentMethods(paymentMethods)
    setSaving(true)
    try {
      await savePaymentMethods(user.uid, normalizedMethods)
      setPaymentMethods(normalizedMethods)
      notify('Payment methods saved.')
      await refresh()
    } catch (error) {
      notify(error.message || 'Payment methods could not be saved.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box className="page-stack">
      <PageHeader title="App Settings" subtitle="Manage products, stock options, and payment methods." />

      <SectionCard
        title="Stock Settings"
        subtitle="Add up to 3 option groups for each product. Variants are created when stock is added or sold."
        actions={<Button variant="outlined" onClick={resetProduct}>New product</Button>}
      >
        <Box className="form-grid" sx={{ mt: 2 }}>
          <TextField
            className="span-12"
            label="Product name"
            value={productDraft.name}
            onChange={(event) => setProductDraft((current) => ({ ...current, name: event.target.value }))}
          />
        </Box>
        <Stack className="settings-product-actions" direction="row" gap={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
          <Button variant="contained" startIcon={<SaveRoundedIcon />} onClick={saveProduct} disabled={saving}>
            Save product
          </Button>
          {productDraft.id ? (
            <Button variant="outlined" color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={removeProduct} disabled={saving}>
              Remove product
            </Button>
          ) : null}
          <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={addLevel} disabled={tree.levels.length >= MAX_OPTION_LEVELS}>
            Add option ({tree.levels.length}/{MAX_OPTION_LEVELS})
          </Button>
        </Stack>

        <Stack spacing={2} sx={{ mt: 3 }}>
          {tree.levels.map((level, index) => {
            const values = optionValuesForLevel(tree, index)
            return (
              <Paper key={level.id} variant="outlined" sx={{ p: 2 }}>
                <Box className="option-level-controls">
                  <TextField
                    label="Option name"
                    placeholder={index === 0 ? 'Size' : index === 1 ? 'Color' : 'Type'}
                    value={level.label}
                    onChange={(event) => updateLevelLabel(index, event.target.value)}
                    fullWidth
                  />
                  <TextField
                    label={`${level.label || `Option ${index + 1}`} value`}
                    placeholder={index === 0 ? 'Small' : index === 1 ? 'Brown' : 'Dress'}
                    value={valueDrafts[level.id] || ''}
                    onChange={(event) => updateValueDraft(level.id, event.target.value)}
                    fullWidth
                  />
                  <Button variant="outlined" onClick={() => addValue(index)} disabled={!String(valueDrafts[level.id] || '').trim()}>
                    Add value
                  </Button>
                  <Button variant="outlined" color="error" onClick={() => removeLevel(index)}>
                    Remove
                  </Button>
                </Box>
                <Stack direction="row" gap={1} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
                  {values.map((value) => (
                    <Chip
                      key={value.id}
                      label={value.label}
                      color={selectedValueIds[index] === value.id ? 'primary' : 'default'}
                      variant={selectedValueIds[index] === value.id ? 'filled' : 'outlined'}
                      onClick={() => selectValue(index, value.id)}
                      onDelete={() => removeValue(value.id)}
                      deleteIcon={<DeleteOutlineRoundedIcon />}
                    />
                  ))}
                  {!values.length ? (
                    <Typography variant="body2" color="text.secondary">
                      No values yet.
                    </Typography>
                  ) : null}
                  {selectedValueIds[index] ? (
                    <Button size="small" variant="text" onClick={() => renameValue(selectedValueIds[index])}>
                      Edit selected
                    </Button>
                  ) : null}
                </Stack>
              </Paper>
            )
          })}
          {!tree.levels.length ? (
            <Alert severity="info">Leave option levels empty for products with no options.</Alert>
          ) : null}
        </Stack>
      </SectionCard>

      <SectionCard title="Products" subtitle="Choose a product to review or edit its option settings.">
        <Stack direction="row" gap={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
          {data.products.map((product) => (
            <Chip
              key={product.id}
              label={product.name}
              color={productDraft.id === product.id ? 'primary' : 'default'}
              variant={productDraft.id === product.id ? 'filled' : 'outlined'}
              onClick={() => loadProduct(product)}
            />
          ))}
          {!data.products.length ? (
            <EmptyState
              compact
              title="No products yet"
              message="Create your first product above before adding stock."
            />
          ) : null}
        </Stack>
      </SectionCard>

      <SectionCard title="Payment Method Settings" subtitle="Create, reorder, activate, or remove payment methods.">
        <Box className="form-grid" sx={{ mt: 2 }}>
          <TextField
            className="span-5"
            label="Method name"
            value={methodDraft.name}
            onChange={(event) => setMethodDraft((current) => ({ ...current, name: event.target.value }))}
          />
          <FormControl className="span-4">
            <InputLabel>Payment behavior</InputLabel>
            <Select
              label="Payment behavior"
              value={methodDraft.type}
              onChange={(event) => setMethodDraft((current) => ({ ...current, type: event.target.value }))}
            >
              <MenuItem value="normal">Standard payment</MenuItem>
              <MenuItem value="cod">Pay-on-delivery collection</MenuItem>
            </Select>
          </FormControl>
          <Button className="span-3" variant="contained" onClick={addPaymentMethod}>
            Add method
          </Button>
        </Box>
        <Stack spacing={1.25} sx={{ mt: 2 }}>
          {paymentMethods.map((method, index) => (
            <Box key={method.id} className="catalog-setting-row">
              <Stack direction={{ xs: 'column', md: 'row' }} gap={1} sx={{ flex: 1 }}>
                <TextField
                  label="Name"
                  value={method.name}
                  onChange={(event) => updatePaymentMethod(method.id, { name: event.target.value })}
                  size="small"
                />
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>Behavior</InputLabel>
                  <Select
                    label="Behavior"
                    value={method.type}
                    onChange={(event) => updatePaymentMethod(method.id, { type: event.target.value })}
                  >
                    <MenuItem value="normal">Standard payment</MenuItem>
                    <MenuItem value="cod">Pay-on-delivery collection</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    label="Status"
                    value={method.active ? 'active' : 'inactive'}
                    onChange={(event) => updatePaymentMethod(method.id, { active: event.target.value === 'active' })}
                  >
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="inactive">Inactive</MenuItem>
                  </Select>
                </FormControl>
                <StatusChip status={method.active ? 'active' : 'inactive'} />
              </Stack>
              <Stack direction="row" gap={0.5}>
                <Button size="small" disabled={index === 0} onClick={() => movePaymentMethod(method.id, -1)}>Up</Button>
                <Button size="small" disabled={index === paymentMethods.length - 1} onClick={() => movePaymentMethod(method.id, 1)}>Down</Button>
                <Button size="small" color="error" onClick={() => removePaymentMethod(method.id)}>Remove</Button>
              </Stack>
            </Box>
          ))}
        </Stack>
        <Button sx={{ mt: 2 }} variant="contained" startIcon={<SaveRoundedIcon />} onClick={saveMethods} disabled={saving}>
          Save payment methods
        </Button>
      </SectionCard>
    </Box>
  )
}
