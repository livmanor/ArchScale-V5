# Deploying the ArchScale Backend to Render

This runbook guides you through deploying the Node.js/Express backend service to [Render](https://render.com).

---

## 1. Quick Setup via Render Dashboard

1. Log into your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** &rarr; **Web Service**.
3. Connect your GitHub repository: `livmanor/ArchScale-V5`.
4. Configure the service settings:
   - **Name**: `archscale-backend`
   - **Language / Runtime**: `Node`
   - **Region**: `Oregon (US West)` (or your preferred region)
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run server`
   - **Plan**: `Free`

---

## 2. Environment Variables to Add in Render

In the **Environment Variables** section of your new Render Web Service, add the following key-value pairs (retrieved from your local `.env`):

| Variable | Value | Purpose |
|----------|-------|---------|
| `NODE_ENV` | `production` | Production mode |
| `ARCHSCALE_ENV` | `production` | Production environment profile |
| `HOST` | `0.0.0.0` | Required for Render container networking |
| `PORT` | `10000` | Render standard internal port |
| `ARCHSCALE_FRONTEND_URL` | `https://archscale-v5.vercel.app` | Vercel production frontend origin |
| `APP_BASE_URL_FRONTSTAGE` | `https://archscale-v5.vercel.app` | Frontstage client URL |
| `APP_BASE_URL_BACKSTAGE` | `https://archscale-v5.vercel.app` | Backstage admin URL |
| `SUPABASE_URL` | *(from `.env`)* | Supabase API URL |
| `SUPABASE_ANON_KEY` | *(from `.env`)* | Supabase Anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | *(from `.env`)* | Supabase Service Role admin key |
| `ARCHSCALE_RUNTIME_DB_URL` | *(from `.env`)* | Least-privilege PostgreSQL connection string |
| `SUPABASE_DB_ADMIN_URL` | *(from `.env`)* | PostgreSQL admin connection string |

---

## 3. Connect Frontend (Vercel) to Render Backend

Once Render finishes deploying, Render will give you a public URL (e.g., `https://archscale-backend.onrender.com`).

To connect the Vercel frontend to your Render backend:
1. Go to your [Vercel Project Settings](https://vercel.com/nsmanish2007-7137s-projects/archscale-v5/settings/environment-variables).
2. Add the environment variable:
   - **Key**: `VITE_API_URL`
   - **Value**: `https://archscale-backend.onrender.com` (replace with your actual Render URL)
   - **Target**: Production, Preview, Development
3. Trigger a redeploy on Vercel (or push to `main`).

Now `https://archscale-v5.vercel.app` will route all auth and RBAC API calls directly to your Render backend and authenticate with your live cloud Supabase database!

