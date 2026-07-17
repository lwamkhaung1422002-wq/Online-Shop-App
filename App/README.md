# POS Shop Owner Frontend

Responsive POS, inventory, order, payment, expense, and profit workspace for a general shop owner.

This frontend uses the `Api` project for auth and production data through REST API calls.

## Local Development

```bash
npm install
npm run dev
```

Create `.env.local` when the API is not running on the default URL:

```env
VITE_API_BASE_URL=http://localhost:3000
```

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Netlify Deployment

- Base directory: `App`
- Build command: `npm run build`
- Publish directory: `dist`
- Required environment variable:

```env
VITE_API_BASE_URL=https://your-railway-api.up.railway.app
```

## Production Notes

- Register and login are handled by the `Api` project.
- Production data is loaded from the API, not browser-only demo data.
- The shop name returned by the API is used as the app title and brand.
- Deploy the backend and database first, then set `VITE_API_BASE_URL` before deploying this frontend.
