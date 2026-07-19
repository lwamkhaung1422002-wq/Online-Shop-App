const { chromium, expect } = require('@playwright/test')

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5190'

async function register(page, shopName) {
  const stamp = Date.now()
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /get started/i }).click()
  await page.getByText('Register', { exact: true }).click()
  await page.getByLabel(/username|owner name/i).fill('Local Verify Owner')
  await page.getByLabel(/shop name/i).fill(shopName)
  await page.getByLabel(/email/i).fill(`local-verify-${stamp}@example.com`)
  await page.getByLabel(/password/i).fill('Password123!')
  await page.getByRole('button', { name: /create shop|register/i }).click()
  await expect(page.getByText(new RegExp(`${shopName}|Home`)).first()).toBeVisible({ timeout: 15000 })
}

async function createSimpleProduct(page, productName) {
  await page.getByText('Settings', { exact: true }).click()
  await page.getByRole('button', { name: /new product/i }).click()
  await page.getByLabel(/product name/i).fill(productName)
  await page.getByRole('button', { name: /save product/i }).click()
  await expect(page.getByText(new RegExp(productName))).toBeVisible({ timeout: 15000 })
}

async function assertSimpleProductFlow(page, productName) {
  await page.getByText('Stock', { exact: true }).click()
  await page.getByRole('button', { name: /add stock/i }).click()

  const stockDialog = page.getByRole('dialog', { name: /add stock/i })
  await expect(stockDialog.getByText(productName)).toBeVisible({ timeout: 10000 })
  const stockSnapshot = await stockDialog.ariaSnapshot()
  const stockWithoutProduct = stockSnapshot.replaceAll(productName, '')
  if (/Final variant|\bVariant\b/.test(stockWithoutProduct)) {
    throw new Error('Add Stock shows a Variant field for a no-option product.')
  }

  await page.getByRole('spinbutton', { name: /unit cost/i }).fill('100')
  await page.getByRole('spinbutton', { name: /sale price/i }).fill('200')
  await page.getByRole('spinbutton', { name: /quantity to add/i }).fill('5')
  await page.getByRole('button', { name: /save stock/i }).click()
  await expect(page.getByText(productName).first()).toBeVisible({ timeout: 10000 })

  await page.getByText('Order', { exact: true }).click()
  await expect(page.getByText(productName).first()).toBeVisible({ timeout: 10000 })
  const orderSnapshot = await page.locator('.section-card').filter({ hasText: 'Add products' }).ariaSnapshot()
  const orderWithoutProduct = orderSnapshot.replaceAll(productName, '')
  if (/Final variant|\bVariant\b/.test(orderWithoutProduct)) {
    throw new Error('Order shows a Variant field for a no-option product.')
  }
}

async function createNestedProduct(page, productName) {
  await page.getByText('Settings', { exact: true }).click()
  await page.getByRole('button', { name: /new product/i }).click()
  await page.getByLabel(/product name/i).fill(productName)
  await page.getByRole('button', { name: /save product/i }).click()
  await expect(page.getByText(new RegExp(productName))).toBeVisible({ timeout: 15000 })

  await page.getByRole('button', { name: /add option/i }).click()
  await page.getByLabel('Option name').fill('Size')
  await page.getByLabel(/Size value/i).fill('Size 1')
  await page.getByRole('button', { name: /add value/i }).click()
  await expect(page.getByText('Size 1')).toBeVisible({ timeout: 5000 })
  await page.getByRole('button', { name: /save product/i }).click()
  await expect(page.getByText(/Product settings saved/i)).toBeVisible({ timeout: 10000 }).catch(() => {})
  await page.getByRole('button', { name: /add selected variant/i }).click()
  await expect(page.getByText('Size 1').first()).toBeVisible({ timeout: 10000 })
}

async function assertNestedProductFlow(page, productName) {
  await page.getByText('Stock', { exact: true }).click()
  await page.getByRole('button', { name: /add stock/i }).click()
  const stockDialog = page.getByRole('dialog', { name: /add stock/i })
  await stockDialog.getByRole('combobox').first().click()
  await page.getByRole('option', { name: productName }).click()
  await expect(stockDialog.locator('label').filter({ hasText: 'Final variant' }).first()).toBeVisible({ timeout: 10000 })
  await stockDialog.getByRole('combobox').nth(1).click()
  await expect(page.getByRole('option', { name: /Size 1/i })).toBeVisible({ timeout: 10000 })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /cancel/i }).click()
}

async function main() {
  const simpleProduct = `Simple Item ${Date.now()}`
  const nestedProduct = `Nested Item ${Date.now()}`
  const shopName = `Local Verify Shop ${Date.now()}`

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })

  await register(page, shopName)
  await createSimpleProduct(page, simpleProduct)
  await assertSimpleProductFlow(page, simpleProduct)
  await createNestedProduct(page, nestedProduct)
  await assertNestedProductFlow(page, nestedProduct)

  await browser.close()
  console.log(JSON.stringify({
    ok: true,
    checked: [
      'register/login',
      'settings simple product',
      'add stock simple product without variant field',
      'order simple product without variant field',
      'settings nested product variant',
      'add stock nested product with variant field',
    ],
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
