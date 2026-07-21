# Local-First Development Guide

Use this guide before any GitHub, Netlify, Railway, Neon, or production work.

## Requirements

- Node.js 22.12 or newer
- Local PostgreSQL
- Two terminals: one for `Api`, one for `App`

## Environment

Create `Api/.env` from `Api/.env.local.example` and keep it local:

```env
NODE_ENV=development
PORT=3108
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/online_shop_local_dev"
JWT_SECRET="local_development_secret_change_me_at_least_32_chars"
CORS_ORIGIN="http://localhost:5190,http://127.0.0.1:5190,http://localhost:5173,http://127.0.0.1:5173"
```

Create `App/.env.local` from `App/.env.local.example`:

```env
VITE_API_BASE_URL=http://127.0.0.1:3108
```

## Install

```bash
cd Api
npm install

cd ../App
npm install
```

## Local Database

Create a local PostgreSQL database named `online_shop_local_dev`, then run:

```bash
cd Api
npm run prisma:validate
npm run prisma:migrate
npm run db:seed:local
```

Sample account:

```text
Email: owner@example.local
Password: Password123!
Shop: Local Demo Shop
```

To reset local data only:

```bash
cd Api
set CONFIRM_LOCAL_DB_RESET=online_shop_local_dev
npm run db:reset:local
npm run prisma:migrate
npm run db:seed:local
```

The reset and seed scripts refuse non-local database hosts.

## Run Locally

Terminal 1:

```bash
cd Api
npm run dev
```

Terminal 2:

```bash
cd App
npm run dev -- --host 127.0.0.1 --port 5190
```

Open `http://127.0.0.1:5190`.

## Verify

API:

```bash
cd Api
npm run prisma:validate
npm run prisma:generate
npm run typecheck
npm run test:api
npm run build
```

App:

```bash
cd App
npm run lint
npm run typecheck
npm run test
npm run build
```

Smoke test when API and App are running:

```bash
cd App
set PLAYWRIGHT_BASE_URL=http://127.0.0.1:5190
npm run test:local-smoke
```

## Manual Checklist

- Register a shop and login.
- Create a product without options.
- Create a product with option groups: Size, Color, Type.
- Add stock with delivery cost and confirm Balance shows Stock Delivery expense.
- Create online order and confirm stock decreases.
- Create in-store sale and confirm payment is received.
- Create advanced payment order, then receive remaining balance in Finance.
- Cancel unpaid order and confirm stock is restored.
- Refund paid order and confirm stock is restored.
- Check Home activity, Sales details, Finance, Balance, profit, reports, and PDF/print.
- Test mobile widths: 360, 390, 430, 768, desktop.
- Test production build locally before deploy.
