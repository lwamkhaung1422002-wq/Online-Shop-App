# Commerce API Testing Guide

Base URL:

```bash
http://localhost:3000
```

Use JSON headers:

```bash
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN
```

Money values are integers. For Myanmar Kyat, send `15000`, not `150.00`.

## 1. Register

```bash
curl -X POST http://localhost:3000/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Owner One\",\"shopName\":\"Main Shop\",\"email\":\"owner@example.com\",\"password\":\"password123\"}"
```

Copy the returned `token`.

## 2. Login

```bash
curl -X POST http://localhost:3000/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"owner@example.com\",\"password\":\"password123\"}"
```

## 3. Create Shop

```bash
curl -X POST http://localhost:3000/shops ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN" ^
  -d "{\"name\":\"Main Shop\"}"
```

Copy the returned `shop.id`.

## 4. Create Category

```bash
curl -X POST http://localhost:3000/shops/SHOP_ID/categories ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN" ^
  -d "{\"name\":\"General\"}"
```

## 5. Create Product

```bash
curl -X POST http://localhost:3000/shops/SHOP_ID/products ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN" ^
  -d "{\"name\":\"Sample Product\",\"sku\":\"ITEM-001\",\"price\":15000,\"cost\":9000,\"categoryId\":\"CATEGORY_ID\"}"
```

## 6. Create Product Variant

```bash
curl -X POST http://localhost:3000/shops/SHOP_ID/products/PRODUCT_ID/variants ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN" ^
  -d "{\"name\":\"Standard\",\"sku\":\"ITEM-001-STD\",\"price\":16000,\"cost\":9500,\"option1\":\"Standard\"}"
```

## 7. Add Inventory Batch

```bash
curl -X POST http://localhost:3000/shops/SHOP_ID/inventory ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN" ^
  -d "{\"productId\":\"PRODUCT_ID\",\"variantId\":\"VARIANT_ID\",\"quantity\":10,\"unitCost\":9000,\"receivedAt\":\"2026-01-01T00:00:00.000Z\"}"
```

## 8. Create Customer

```bash
curl -X POST http://localhost:3000/shops/SHOP_ID/customers ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN" ^
  -d "{\"name\":\"Daw Mya\",\"phone\":\"09123456789\",\"city\":\"Yangon\",\"address\":\"Hledan\"}"
```

## 9. Create Multi-Item Order

```bash
curl -X POST http://localhost:3000/shops/SHOP_ID/orders ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN" ^
  -d "{\"customerId\":\"CUSTOMER_ID\",\"fulfillmentStatus\":\"reserved\",\"discount\":1000,\"deliveryFee\":2000,\"items\":[{\"productId\":\"PRODUCT_ID\",\"variantId\":\"VARIANT_ID\",\"quantity\":2,\"unitPrice\":16000,\"deductionType\":\"discount\"}]}"
```

Reserved orders automatically reserve inventory using FIFO. You can also send an embedded `customer` object instead of `customerId`.

## 10. Fulfill Preorder

```bash
curl -X POST http://localhost:3000/shops/SHOP_ID/orders/ORDER_ID/fulfill ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 11. Receive Payment

```bash
curl -X POST http://localhost:3000/shops/SHOP_ID/orders/ORDER_ID/payments ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN" ^
  -d "{\"method\":\"KBZ Pay\",\"amount\":10000,\"transactionId\":\"123456\",\"billNumber\":\"BILL-001\"}"
```

Partial/deposit payments are accepted up to the remaining order balance.

## 12. Receive COD Settlement

```bash
curl -X POST http://localhost:3000/shops/SHOP_ID/payments/cod-settlements ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN" ^
  -d "{\"billNumber\":\"COD-001\",\"allocations\":[{\"orderId\":\"ORDER_ID\",\"amount\":10000}]}"
```

## 13. Void COD Settlement

```bash
curl -X POST http://localhost:3000/shops/SHOP_ID/payments/PAYMENT_ID/void ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN" ^
  -d "{\"reason\":\"Wrong COD bill\"}"
```

## 14. Refund

```bash
curl -X POST http://localhost:3000/shops/SHOP_ID/orders/ORDER_ID/refunds ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN" ^
  -d "{\"method\":\"KBZ Pay\",\"transactionId\":\"654321\",\"note\":\"Customer returned items\"}"
```

## 15. Cancel Order

```bash
curl -X POST http://localhost:3000/shops/SHOP_ID/orders/ORDER_ID/cancel ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN" ^
  -d "{\"reason\":\"Cancelled after refund\"}"
```

Cancelling releases reserved inventory.

## 16. Add Expense

```bash
curl -X POST http://localhost:3000/shops/SHOP_ID/expenses ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN" ^
  -d "{\"title\":\"Packaging bags\",\"category\":\"Packaging\",\"amount\":5000,\"spentAt\":\"2026-03-01T00:00:00.000Z\"}"
```

## 17. Dashboard

```bash
curl http://localhost:3000/shops/SHOP_ID/dashboard ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Optional date filter:

```bash
curl "http://localhost:3000/shops/SHOP_ID/dashboard?from=2026-01-01&to=2026-12-31" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 18. Sales Report

```bash
curl http://localhost:3000/shops/SHOP_ID/reports/sales ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Protection Tests

Without token:

```bash
curl http://localhost:3000/shops/SHOP_ID/orders
```

Expected: `401`.

With another user's token:

```bash
curl http://localhost:3000/shops/SHOP_ID/products ^
  -H "Authorization: Bearer OTHER_USER_TOKEN"
```

Expected: `404`.

Invalid request body:

```bash
curl -X POST http://localhost:3000/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"\",\"shopName\":\"\",\"email\":\"bad\",\"password\":\"short\"}"
```

Expected: `400` with `Validation error.`
