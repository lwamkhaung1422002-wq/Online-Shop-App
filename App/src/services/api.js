const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
const TOKEN_KEY = 'pos-shop-owner-token'
const SHOP_KEY = 'pos-shop-owner-shop-id'

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function storeToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(SHOP_KEY)
}

export function getStoredShopId() {
  return localStorage.getItem(SHOP_KEY)
}

export function storeShopId(shopId) {
  if (shopId) localStorage.setItem(SHOP_KEY, shopId)
}

async function parseResponse(response) {
  if (response.status === 204) return null

  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    const details = data?.errors
      ? Object.values(data.errors).flat().filter(Boolean).join(' ')
      : ''
    throw new Error(details || data?.message || 'Request failed.')
  }

  return data
}

export async function apiRequest(path, { method = 'GET', body, token = getStoredToken() } = {}) {
  if (!token && path !== '/auth/register' && path !== '/auth/login') {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth-required'))
    }
    throw new Error('Sign in or register to use this action.')
  }

  const headers = {
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  return parseResponse(response)
}

export const api = {
  register: (payload) => apiRequest('/auth/register', { method: 'POST', body: payload, token: null }),
  login: (payload) => apiRequest('/auth/login', { method: 'POST', body: payload, token: null }),
  me: () => apiRequest('/auth/me'),
  shops: () => apiRequest('/shops'),
  shopSettings: (shopId) => apiRequest(`/shops/${shopId}/settings`),
  updateShopSettings: (shopId, payload) =>
    apiRequest(`/shops/${shopId}/settings`, { method: 'PATCH', body: payload }),
  dashboard: (shopId) => apiRequest(`/shops/${shopId}/dashboard`),
  categories: (shopId) => apiRequest(`/shops/${shopId}/categories`),
  createCategory: (shopId, payload) =>
    apiRequest(`/shops/${shopId}/categories`, { method: 'POST', body: payload }),
  products: (shopId) => apiRequest(`/shops/${shopId}/products`),
  createProduct: (shopId, payload) =>
    apiRequest(`/shops/${shopId}/products`, { method: 'POST', body: payload }),
  updateProduct: (shopId, productId, payload) =>
    apiRequest(`/shops/${shopId}/products/${productId}`, { method: 'PATCH', body: payload }),
  deleteProduct: (shopId, productId) =>
    apiRequest(`/shops/${shopId}/products/${productId}`, { method: 'DELETE' }),
  createVariant: (shopId, productId, payload) =>
    apiRequest(`/shops/${shopId}/products/${productId}/variants`, { method: 'POST', body: payload }),
  updateVariant: (shopId, productId, variantId, payload) =>
    apiRequest(`/shops/${shopId}/products/${productId}/variants/${variantId}`, { method: 'PATCH', body: payload }),
  deleteVariant: (shopId, productId, variantId) =>
    apiRequest(`/shops/${shopId}/products/${productId}/variants/${variantId}`, { method: 'DELETE' }),
  inventory: (shopId) => apiRequest(`/shops/${shopId}/inventory`),
  createInventory: (shopId, payload) =>
    apiRequest(`/shops/${shopId}/inventory`, { method: 'POST', body: payload }),
  deleteInventory: (shopId, batchId) =>
    apiRequest(`/shops/${shopId}/inventory/${batchId}`, { method: 'DELETE' }),
  adjustInventory: (shopId, batchId, payload) =>
    apiRequest(`/shops/${shopId}/inventory/${batchId}/adjustments`, { method: 'POST', body: payload }),
  adjustments: (shopId) => apiRequest(`/shops/${shopId}/inventory-adjustments`),
  customers: (shopId) => apiRequest(`/shops/${shopId}/customers`),
  createCustomer: (shopId, payload) =>
    apiRequest(`/shops/${shopId}/customers`, { method: 'POST', body: payload }),
  orders: (shopId) => apiRequest(`/shops/${shopId}/orders`),
  createOrder: (shopId, payload) =>
    apiRequest(`/shops/${shopId}/orders`, { method: 'POST', body: payload }),
  completeOrder: (shopId, orderId, fulfillmentStatus) =>
    apiRequest(`/shops/${shopId}/orders/${orderId}/status`, {
      method: 'PATCH',
      body: { fulfillmentStatus },
    }),
  fulfillPreorder: (shopId, orderId) =>
    apiRequest(`/shops/${shopId}/orders/${orderId}/fulfill`, { method: 'POST', body: {} }),
  cancelOrder: (shopId, orderId, reason) =>
    apiRequest(`/shops/${shopId}/orders/${orderId}/cancel`, { method: 'POST', body: { reason } }),
  deleteOrder: (shopId, orderId) =>
    apiRequest(`/shops/${shopId}/orders/${orderId}`, { method: 'DELETE' }),
  payments: (shopId) => apiRequest(`/shops/${shopId}/payments`),
  receivePayment: (shopId, orderId, payload) =>
    apiRequest(`/shops/${shopId}/orders/${orderId}/payments`, { method: 'POST', body: payload }),
  receiveCodSettlement: (shopId, payload) =>
    apiRequest(`/shops/${shopId}/payments/cod-settlements`, { method: 'POST', body: payload }),
  voidCodSettlement: (shopId, paymentId, payload) =>
    apiRequest(`/shops/${shopId}/payments/${paymentId}/void`, { method: 'POST', body: payload }),
  refundPayment: (shopId, orderId, payload) =>
    apiRequest(`/shops/${shopId}/orders/${orderId}/refunds`, { method: 'POST', body: payload }),
  expenses: (shopId) => apiRequest(`/shops/${shopId}/expenses`),
  createExpense: (shopId, payload) =>
    apiRequest(`/shops/${shopId}/expenses`, { method: 'POST', body: payload }),
  updateExpense: (shopId, expenseId, payload) =>
    apiRequest(`/shops/${shopId}/expenses/${expenseId}`, { method: 'PATCH', body: payload }),
  deleteExpense: (shopId, expenseId) =>
    apiRequest(`/shops/${shopId}/expenses/${expenseId}`, { method: 'DELETE' }),
}
