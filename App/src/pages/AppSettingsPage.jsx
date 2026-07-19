import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
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
import { useAuth } from '../contexts/AuthContext.jsx'
import { useData } from '../contexts/DataContext.jsx'
import { useFeedback } from '../contexts/FeedbackContext.jsx'
import {
  createProductDocument,
  createVariantDocument,
  deleteVariantDocument,
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
  optionPathFromValueIds,
  optionValuesForLevel,
  valueIdsFromOptionPath,
  variantDisplayName,
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
  const [methodDraft, setMethodDraft] = useState(paymentDraft)
  const [paymentMethods, setPaymentMethods] = useState(() => settings.paymentMethods)
  const [saving, setSaving] = useState(false)

  const tree = normalizeOptionTree(productDraft.optionTree)
  const activePath = optionPathFromValueIds(tree, selectedValueIds)

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
          { id: createOptionId('level'), label: `Option ${current.optionTree.levels.length + 1}` },
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
      variants: current.variants.filter((variant) => valueIdsFromOptionPath(variant.optionPath).length <= nextDepth),
    }))
    setSelectedValueIds((current) => current.slice(0, nextDepth))
  }

  const addValue = (levelIndex, parentId) => {
    const label = window.prompt(`New ${tree.levels[levelIndex]?.label || 'option'} value`)
    const trimmed = String(label || '').trim()
    if (!trimmed) return
    setProductDraft((current) => ({
      ...current,
      optionTree: {
        ...current.optionTree,
        values: [
          ...current.optionTree.values,
          {
            id: createOptionId('value'),
            label: trimmed,
            level: levelIndex,
            parentId: levelIndex === 0 ? null : parentId,
          },
        ],
      },
    }))
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
      refresh()
      loadProduct({ ...savedProduct, variants: savedProduct.variants || productDraft.variants })
    } catch (error) {
      notify(error.message || 'Product settings could not be saved.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const addVariant = async () => {
    if (requireAuth?.('add product variant')) return
    if (!productDraft.id) {
      notify('Save the product before adding variants.', 'warning')
      return
    }
    const path = tree.levels.length ? activePath : []
    if (tree.levels.length && path.length !== tree.levels.length) {
      notify('Select a final option path first.', 'warning')
      return
    }
    setSaving(true)
    try {
      await createVariantDocument(user.uid, productDraft.id, {
        name: path.length ? path.map((entry) => entry.value).join(' / ') : 'Default',
        price: Number(productDraft.price || 0),
        cost: Number(productDraft.cost || 0),
        optionPath: path,
      })
      notify('Variant added.')
      refresh()
      setSelectedValueIds([])
    } catch (error) {
      notify(error.message || 'Variant could not be added.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const deleteVariant = async (variant) => {
    if (requireAuth?.('remove product variant')) return
    setSaving(true)
    try {
      await deleteVariantDocument(user.uid, productDraft.id, variant.id)
      notify('Variant removed or archived.')
      refresh()
    } catch (error) {
      notify(error.message || 'Variant could not be removed.', 'error')
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
    setSaving(true)
    try {
      await savePaymentMethods(user.uid, normalizePaymentMethods(paymentMethods))
      notify('Payment methods saved.')
      refresh()
    } catch (error) {
      notify(error.message || 'Payment methods could not be saved.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box className="page-stack">
      <PageHeader title="App Settings" subtitle="Manage products, stock options, and payment methods." />

      <Paper variant="outlined" className="section-card">
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={{ justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h6">Stock Settings</Typography>
            <Typography variant="body2" color="text.secondary">
              Build products with flexible nested options. Only explicit final paths become variants.
            </Typography>
          </Box>
          <Button variant="outlined" onClick={resetProduct}>New product</Button>
        </Stack>
        <Box className="form-grid" sx={{ mt: 2 }}>
          <TextField
            className="span-12"
            label="Product name"
            value={productDraft.name}
            onChange={(event) => setProductDraft((current) => ({ ...current, name: event.target.value }))}
          />
        </Box>
        <Stack direction="row" gap={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
          <Button variant="contained" startIcon={<SaveRoundedIcon />} onClick={saveProduct} disabled={saving}>
            Save product
          </Button>
          <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={addLevel} disabled={tree.levels.length >= MAX_OPTION_LEVELS}>
            Add option
          </Button>
        </Stack>

        <Stack spacing={2} sx={{ mt: 3 }}>
          {tree.levels.map((level, index) => {
            const parentId = index === 0 ? null : selectedValueIds[index - 1]
            const values = optionValuesForLevel(tree, index, parentId)
            return (
              <Paper key={level.id} variant="outlined" sx={{ p: 2 }}>
                <Box className="option-level-controls">
                  <TextField
                    label="Option name"
                    placeholder="Size, Color, Material, Storage"
                    value={level.label}
                    onChange={(event) => updateLevelLabel(index, event.target.value)}
                    fullWidth
                  />
                  <FormControl fullWidth>
                    <InputLabel>{level.label}</InputLabel>
                    <Select
                      label={level.label}
                      value={selectedValueIds[index] || ''}
                      onChange={(event) =>
                        setSelectedValueIds((current) => [
                          ...current.slice(0, index),
                          event.target.value,
                        ])
                      }
                      disabled={index > 0 && !parentId}
                    >
                      {values.map((value) => (
                        <MenuItem key={value.id} value={value.id}>{value.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button variant="outlined" onClick={() => addValue(index, parentId)} disabled={index > 0 && !parentId}>
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
                      onClick={() => renameValue(value.id)}
                      onDelete={() => removeValue(value.id)}
                      deleteIcon={<DeleteOutlineRoundedIcon />}
                    />
                  ))}
                  {!values.length ? <Typography variant="body2" color="text.secondary">No values yet.</Typography> : null}
                </Stack>
              </Paper>
            )
          })}
          {!tree.levels.length ? (
            <Alert severity="info">Leave option levels empty for products with no options.</Alert>
          ) : null}
        </Stack>

        <Divider sx={{ my: 3 }} />
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={{ justifyContent: 'space-between', alignItems: { md: 'center' } }}>
          <Box>
            <Typography fontWeight={900}>Explicit variants</Typography>
            <Typography variant="body2" color="text.secondary">
              Add only the final option paths that really exist.
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={addVariant} disabled={saving || !productDraft.id}>
            Add selected variant
          </Button>
        </Stack>
        <Stack direction="row" gap={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
          {(productDraft.variants || []).map((variant) => (
            <Chip
              key={variant.id}
              label={variantDisplayName(variant)}
              onDelete={() => deleteVariant(variant)}
              deleteIcon={<DeleteOutlineRoundedIcon />}
            />
          ))}
          {productDraft.id && !productDraft.variants?.length ? (
            <Typography variant="body2" color="text.secondary">No variants created yet.</Typography>
          ) : null}
        </Stack>
      </Paper>

      <Paper variant="outlined" className="section-card">
        <Typography variant="h6">Products</Typography>
        <Stack direction="row" gap={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
          {data.products.map((product) => (
            <Chip
              key={product.id}
              label={`${product.name} (${product.variants?.length || 0})`}
              color={productDraft.id === product.id ? 'primary' : 'default'}
              variant={productDraft.id === product.id ? 'filled' : 'outlined'}
              onClick={() => loadProduct(product)}
            />
          ))}
          {!data.products.length ? <Typography color="text.secondary">No products yet.</Typography> : null}
        </Stack>
      </Paper>

      <Paper variant="outlined" className="section-card">
        <Typography variant="h6">Payment Method Settings</Typography>
        <Box className="form-grid" sx={{ mt: 2 }}>
          <TextField
            className="span-5"
            label="Method name"
            value={methodDraft.name}
            onChange={(event) => setMethodDraft((current) => ({ ...current, name: event.target.value }))}
          />
          <FormControl className="span-4">
            <InputLabel>Method type</InputLabel>
            <Select
              label="Method type"
              value={methodDraft.type}
              onChange={(event) => setMethodDraft((current) => ({ ...current, type: event.target.value }))}
            >
              <MenuItem value="normal">Normal</MenuItem>
              <MenuItem value="cod">COD-like</MenuItem>
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
                  <InputLabel>Type</InputLabel>
                  <Select
                    label="Type"
                    value={method.type}
                    onChange={(event) => updatePaymentMethod(method.id, { type: event.target.value })}
                  >
                    <MenuItem value="normal">Normal</MenuItem>
                    <MenuItem value="cod">COD-like</MenuItem>
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
      </Paper>
    </Box>
  )
}
