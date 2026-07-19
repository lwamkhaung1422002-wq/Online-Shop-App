export const defaultCatalogSettings = {
  productLabel: 'Product',
  option1Label: 'Option 1',
  option2Label: 'Option 2',
  option2Enabled: true,
  productListLabel: 'Products',
  option1ValuesLabel: 'Option 1 Values',
  option2ValuesLabel: 'Option 2 Values',
  option1Values: ['Standard'],
  option2Values: ['General'],
}

export const MAX_OPTION_LEVELS = 5

export function uniqueCatalogValues(values) {
  return [...new Set((values || []).map((value) => String(value).trim()).filter(Boolean))]
}

export function normalizeCatalogSettings(settings = {}) {
  return {
    ...defaultCatalogSettings,
    ...settings,
    option1Values: uniqueCatalogValues(settings.option1Values?.length ? settings.option1Values : defaultCatalogSettings.option1Values),
    option2Values: uniqueCatalogValues(settings.option2Values?.length ? settings.option2Values : defaultCatalogSettings.option2Values),
  }
}

export function catalogLabels(settings = {}) {
  const catalog = normalizeCatalogSettings(settings)
  return {
    product: catalog.productLabel,
    productPlural: catalog.productListLabel,
    option1: catalog.option1Label,
    option2: catalog.option2Label,
    option1Values: catalog.option1ValuesLabel,
    option2Values: catalog.option2ValuesLabel,
    allProducts: `All ${catalog.productListLabel}`,
    allOption1: `All ${catalog.option1Label}`,
    allOption2: `All ${catalog.option2Label}`,
  }
}

export function createOptionId(prefix = 'opt') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function normalizeOptionTree(tree = {}) {
  const levels = Array.isArray(tree.levels)
    ? tree.levels
        .slice(0, MAX_OPTION_LEVELS)
        .map((level, index) => ({
          id: String(level.id || `level-${index + 1}`).trim(),
          label: String(level.label || `Option ${index + 1}`).trim(),
          level: index,
        }))
        .filter((level) => level.id && level.label)
    : []

  const values = Array.isArray(tree.values)
    ? tree.values
        .map((value) => ({
          id: String(value.id || '').trim(),
          label: String(value.label || '').trim(),
          level: Number(value.level || 0),
          parentId: value.parentId ? String(value.parentId).trim() : null,
        }))
        .filter((value) => value.id && value.label && value.level >= 0 && value.level < MAX_OPTION_LEVELS)
    : []

  const levelCount = levels.length
  const ids = new Set()
  const uniqueValues = []
  values.forEach((value) => {
    if (value.level >= levelCount || ids.has(value.id)) return
    ids.add(value.id)
    uniqueValues.push(value)
  })

  return { levels, values: uniqueValues }
}

export function optionPathSignature(path = []) {
  if (!Array.isArray(path) || path.length === 0) return '__default'
  return path
    .slice()
    .sort((a, b) => Number(a.level || 0) - Number(b.level || 0))
    .map((entry) => `${Number(entry.level || 0)}:${entry.valueId}`)
    .join('|')
}

export function normalizeOptionPath(path = []) {
  return Array.isArray(path)
    ? path
        .slice(0, MAX_OPTION_LEVELS)
        .map((entry, index) => ({
          level: Number(entry.level ?? index),
          label: String(entry.label || `Option ${index + 1}`).trim(),
          valueId: String(entry.valueId || '').trim(),
          value: String(entry.value || '').trim(),
        }))
        .filter((entry) => entry.valueId && entry.value)
        .sort((a, b) => a.level - b.level)
    : []
}

export function variantDisplayName(variant) {
  const path = normalizeOptionPath(variant?.optionPath)
  if (path.length) return path.map((entry) => entry.value).join(' / ')
  return variant?.name || 'Default'
}

export function variantOptionValue(variant, level, fallback = '-') {
  const path = normalizeOptionPath(variant?.optionPath)
  return path.find((entry) => entry.level === level)?.value || fallback
}

export function childOptionsForParent(tree, parentId, level = 1) {
  const normalized = normalizeOptionTree(tree)
  return normalized.values.filter(
    (value) => value.level === level && String(value.parentId || '') === String(parentId || ''),
  )
}

export function parentOptions(tree) {
  return normalizeOptionTree(tree).values.filter((value) => value.level === 0)
}

export function optionValuesForLevel(tree, level, parentId = null) {
  const normalized = normalizeOptionTree(tree)
  return normalized.values.filter(
    (value) =>
      value.level === level &&
      (level === 0 || String(value.parentId || '') === String(parentId || '')),
  )
}

export function optionPathFromValueIds(tree, valueIds = []) {
  const normalized = normalizeOptionTree(tree)
  const valuesById = new Map(normalized.values.map((value) => [value.id, value]))
  const path = []

  for (let index = 0; index < normalized.levels.length; index += 1) {
    const value = valuesById.get(valueIds[index])
    if (!value || value.level !== index) return []
    if (index > 0 && value.parentId !== valueIds[index - 1]) return []
    path.push({
      level: index,
      label: normalized.levels[index].label,
      valueId: value.id,
      value: value.label,
    })
  }

  return path
}

export function valueIdsFromOptionPath(path = []) {
  return normalizeOptionPath(path).map((entry) => entry.valueId)
}

export function optionPathMatchesValueIds(path = [], valueIds = []) {
  const normalized = normalizeOptionPath(path)
  if (normalized.length !== valueIds.length) return false
  return normalized.every((entry, index) => entry.valueId === valueIds[index])
}
