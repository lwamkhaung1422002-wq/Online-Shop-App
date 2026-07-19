export interface StockAllocation {
  stockBatchId: string
  quantity: number
  unitCost: number
}

export interface OrderItem {
  id: string
  type: string
  size: string
  color: string
  quantity: number
  unitPrice: number
  unitCost: number
  discount: number
  deductionType?: 'discount' | 'advance-payment'
  lineTotal: number
  allocations: StockAllocation[]
}

export interface Order {
  id: string
  customer: {
    name: string
    phone: string
    city: string
    address: string
  }
  items: OrderItem[]
  date: string
  subtotal: number
  discount: number
  deliveryFee: number
  total: number
  fulfillmentStatus: 'draft' | 'reserved' | 'completed' | 'cancelled' | 'preorder'
  paymentStatus: 'unpaid' | 'paid' | 'refunded'
  source: string
  remark: string
  createdAt?: unknown
  updatedAt?: unknown
}
