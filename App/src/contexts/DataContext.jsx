/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { emptyData, refreshUserData } from '../services/shopApiService.js'
import { useAuth } from './AuthContext.jsx'

const DataContext = createContext(null)
const today = new Date().toISOString().slice(0, 10)

const previewData = {
  ...emptyData,
  stocks: [
    {
      id: 'stock-1',
      productId: 'product-1',
      variantId: 'variant-1',
      date: today,
      deli: 3000,
      size: '500g',
      color: 'Arabica',
      type: 'Premium Coffee Beans',
      unitCost: 21000,
      salePrice: 32000,
      price: 32000,
      quantity: 30,
      reservedQuantity: 2,
    },
    {
      id: 'stock-2',
      productId: 'product-2',
      variantId: 'variant-2',
      date: today,
      deli: 0,
      size: 'Blue',
      color: 'Ceramic',
      type: 'Reusable Mug',
      unitCost: 9500,
      salePrice: 18000,
      price: 18000,
      quantity: 12,
      reservedQuantity: 1,
    },
  ],
  orders: [
    {
      id: 'order-1',
      customer: { name: 'Aye Chan', phone: '09 123 456 789', city: 'Yangon', address: 'Sanchaung' },
      items: [
        {
          id: 'item-1',
          productId: 'product-1',
          variantId: 'variant-1',
          type: 'Premium Coffee Beans',
          size: '500g',
          color: 'Arabica',
          quantity: 2,
          unitPrice: 32000,
          unitCost: 21000,
          discount: 0,
          deductionType: 'discount',
          lineTotal: 64000,
          allocations: [{ stockBatchId: 'stock-1', quantity: 2, unitCost: 21000 }],
        },
      ],
      date: today,
      subtotal: 64000,
      discount: 0,
      deliveryFee: 3000,
      total: 67000,
      fulfillmentStatus: 'completed',
      paymentStatus: 'paid',
      source: 'Walk-in',
      remark: '',
      received: true,
      paid: true,
    },
    {
      id: 'order-2',
      customer: { name: 'Min Thu', phone: '09 987 654 321', city: 'Mandalay', address: 'Chanayethazan' },
      items: [
        {
          id: 'item-2',
          productId: 'product-2',
          variantId: 'variant-2',
          type: 'Reusable Mug',
          size: 'Blue',
          color: 'Ceramic',
          quantity: 1,
          unitPrice: 18000,
          unitCost: 9500,
          discount: 0,
          deductionType: 'discount',
          lineTotal: 18000,
          allocations: [{ stockBatchId: 'stock-2', quantity: 1, unitCost: 9500 }],
        },
      ],
      date: today,
      subtotal: 18000,
      discount: 0,
      deliveryFee: 2000,
      total: 20000,
      fulfillmentStatus: 'reserved',
      paymentStatus: 'unpaid',
      source: 'Online',
      remark: 'Preview order',
      received: false,
      paid: false,
    },
  ],
  payments: [
    { id: 'payment-1', orderId: 'order-1', amount: 67000, method: 'Cash', date: today, type: 'payment' },
  ],
  expenses: [
    { id: 'expense-1', title: 'Packaging', amount: 25000, type: 'Operations', category: 'Operations', method: 'Cash', date: today, note: 'Preview expense' },
  ],
  productTypes: ['Premium Coffee Beans', 'Reusable Mug', 'Gift Set'],
  productColors: ['Arabica', 'Ceramic', 'General'],
  option1Values: ['500g', 'Blue', 'Standard'],
  option2Values: ['Arabica', 'Ceramic', 'General'],
  categories: [{ id: 'category-1', name: 'General Products' }],
  products: [
    { id: 'product-1', name: 'Premium Coffee Beans', price: 32000, cost: 21000 },
    { id: 'product-2', name: 'Reusable Mug', price: 18000, cost: 9500 },
  ],
  customers: [
    { id: 'customer-1', name: 'Aye Chan', phone: '09 123 456 789' },
    { id: 'customer-2', name: 'Min Thu', phone: '09 987 654 321' },
  ],
}

export function DataProvider({ children }) {
  const { user } = useAuth()
  const [data, setData] = useState(() => (user?.preview ? previewData : emptyData))
  const [loading, setLoading] = useState(() => Boolean(user && !user.preview))
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!user) return
    if (user.preview) {
      setData(previewData)
      setError('')
      return
    }

    setError('')
    const nextData = await refreshUserData(user.uid)
    setData(nextData)
  }, [user])

  useEffect(() => {
    let active = true

    if (!user) return undefined

    if (user.preview) {
      return undefined
    }

    refreshUserData(user.uid)
      .then((nextData) => {
        if (!active) return
        setData(nextData)
        setError('')
      })
      .catch((nextError) => {
        if (!active) return
        setError(nextError.message || 'Failed to load shop data.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [user])

  const value = useMemo(
    () => ({
      data,
      loading,
      error,
      refresh,
    }),
    [data, loading, error, refresh],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const context = useContext(DataContext)
  if (!context) {
    throw new Error('useData must be used within DataProvider')
  }

  return context
}
