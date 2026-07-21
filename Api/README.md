# Online Shop API

Express API for the `App` frontend, designed for Railway with Neon PostgreSQL.

## Local Development

For the full safe local-first workflow, including local PostgreSQL setup, seed data,
sample account, smoke tests, and reset guard, see `../LOCAL_DEVELOPMENT.md`.

```bash
npm install
npm run dev
```

Create `.env` from `.env.example`:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/DBNAME?sslmode=require"
JWT_SECRET="replace-with-a-long-random-secret-at-least-32-characters"
CORS_ORIGIN="http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
```

## Railway + Neon Deployment

1. Create a Neon PostgreSQL database.
2. Add Railway environment variables:

```env
NODE_ENV=production
DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/DBNAME?sslmode=require"
JWT_SECRET="replace-with-a-long-random-secret-at-least-32-characters"
CORS_ORIGIN="https://your-netlify-site.netlify.app"
```

3. Railway build command:

```bash
npm install --include=dev && npm run build
```

4. Railway start command:

```bash
npm run prisma:deploy && npm run start
```

`railway.json` already defines those commands and uses `/health` as the health check.

## Migration Commands

Use deploy migrations in production:

```bash
npm run prisma:deploy
```

Use development migrations only for local schema work:

```bash
npm run prisma:migrate
```

## Verification

```bash
npm run prisma:validate
npm run prisma:generate
npm run typecheck
npm run build
```

## Deployment Order

1. Create Neon database.
2. Deploy Railway API with `DATABASE_URL`, `JWT_SECRET`, and `CORS_ORIGIN`.
3. Confirm `https://your-railway-api/health` returns `{ "status": "ok" }`.
4. Deploy Netlify frontend with `VITE_API_BASE_URL` pointing to Railway.
5. Register a test shop and verify auth, stock, orders, payments, and expenses.
