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
