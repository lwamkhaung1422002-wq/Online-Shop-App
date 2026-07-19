# Deployment Checklist

Use this checklist to avoid wasting Netlify or Railway credits on broken builds.

## 1. Verify Locally First

Run this from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-local.ps1
```

This script:

- Creates a temporary local PostgreSQL database.
- Applies Prisma migrations locally only.
- Runs API validation, typecheck, and build.
- Runs App lint, typecheck, tests, and production build.
- Starts local API and local App.
- Runs browser smoke tests for:
  - register/login
  - Settings product creation
  - Add Stock product visibility
  - Order product visibility
  - simple products without a Variant selector
  - nested products with a Variant selector

Deploy only after this script passes.

## 2. Keep Auto Deploy Paused

To save credits, keep auto deploy disabled while development is active.

Netlify:

- Site settings
- Build & deploy
- Continuous deployment
- Stop/pause auto publishing or deploys from Git

Railway:

- Service settings
- Source / Deploy
- Disable automatic deploys from GitHub

## 3. Manual Deploy Order

When local verification passes:

1. Push to GitHub.
2. Deploy Railway only if `Api` changed.
3. Deploy Netlify if `App` changed.

For frontend-only changes, deploy Netlify only.

For backend/API/database changes, deploy Railway first, then Netlify.

## 4. Production Environment Variables

Railway API:

- `DATABASE_URL`
- `JWT_SECRET`
- `NODE_ENV=production`
- `CORS_ORIGIN=https://your-netlify-site.netlify.app`

Netlify App:

- `VITE_API_BASE_URL=https://your-railway-api.up.railway.app`

