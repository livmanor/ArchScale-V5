# ArchScale V5 — Organisation-First Auth & Enterprise Work Platform

ArchScale V5 is a multi-tenant, organisation-first identity, authorization, and workforce management platform built with modern React, Express, Supabase Auth, and PostgreSQL Row-Level Security (RLS).

---

## 🌐 Live Deployments & Key Links

- 🖥️ **Production Frontend (Vercel):** [https://archscale-v5.vercel.app](https://archscale-v5.vercel.app)
- ⚙️ **Production Backend API (Render):** [https://archscale-v5.onrender.com](https://archscale-v5.onrender.com)
- 🐙 **Source Code (GitHub):** [https://github.com/livmanor/ArchScale-V5](https://github.com/livmanor/ArchScale-V5)
- ⚡ **Supabase Project:** [https://avntrnedrhysiqdkmdwc.supabase.co](https://avntrnedrhysiqdkmdwc.supabase.co)
- 📖 **Render Deployment Guide:** [docs/RENDER_DEPLOYMENT.md](docs/RENDER_DEPLOYMENT.md)

---

## 🏗️ Architecture & Technology Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, CSS Modules | High-performance SPA with responsive sidebar navigation and Bernaire CRM UI design tokens. |
| **Backend** | Node.js 24, Express 5, `tsx` | RESTful API service supporting CORS, context session binding, and rate limiting. |
| **Database** | PostgreSQL 15+ with RLS | Strict multi-tenant data isolation, security definer triggers, and immutable audit logs. |
| **Authentication** | Supabase Auth | Email/Password, Google OAuth 2.0, and MFA (TOTP) step-up authentication (`aal1` → `aal2`). |
| **Data Access** | `pg` Pool (Dual-Role Security) | Runtime queries execute strictly under least-privilege role `archscale_app_runtime`; admin role is restricted to migrations. |
| **Client SDK** | TypeScript SDK (`XAuthClient`) | Token memory management, auto session refresh, and context header encapsulation (`x-archscale-context`). |

---

## 👥 Platform Roles & Permissions

The application distinguishes between **Backstage** (Platform Operations) and **Frontstage** (Tenant Subscriber Workspaces):

| Persona | Role Key | Department / Job | Primary Capabilities |
| :--- | :--- | :--- | :--- |
| **Founder** | `founder` | Platform Operations | **Backstage:** Approve/suspend tenant subscriber organisations, manage platform-wide RBAC matrix, issue audited support grants. |
| **Client Servicing** | `client_servicing` | Platform Operations | **Backstage:** Platform monitoring, auditing, and tenant support escalation. |
| **Business Owner** | `business_owner` | Management / Tenant Admin | **Frontstage:** Full workforce administration, invite team members, adjust roles, oversee tenant tasks, and **monitor/maintain employee & intern attendance**. |
| **HR Manager** | `manager_coordinator` | Human Resources (HR) | **Frontstage:** Tenant-wide attendance oversight, status corrections (*Present, Absent, Leave, WFH*), work hour adjustments, and official HR commentary. |
| **Team Leader** | `leader` | Department Lead (e.g. Design) | **Frontstage:** Create tasks, assign work to direct reports, and review/approve completed work. |
| **Intern / Member** | `intern` / `member` | General / Departmental Staff | **Frontstage:** Self-service daily check-in / check-out, view personal attendance logs, and complete assigned tasks. |

---

## 🔑 Test Credentials (Quick Reference)

All test users below are pre-provisioned in the live staging/production database:

| Role | Email | Password | MFA Requirement |
| :--- | :--- | :--- | :--- |
| **HR Manager** | `TEST-hr-1793191468865@archscale.test` | `P@ss-hr-manager-2026-A1!` | *None (Immediate Sign In)* |
| **Intern** | `TEST-intern-1793191468865@archscale.test` | `P@ss-06582d27df902a93ee021407-A1!` | *None (Immediate Sign In)* |
| **Business Owner** | `TEST-owner-1793191468865@archscale.test` | `P@ss-e44e3ead19a1b9b50faa365d-A1!` | TOTP Authenticator (or CLI) |
| **Founder** | `TEST-founder-1793191468865@archscale.test` | `P@ss-7b3dfe4aa5ae06521f4f2658-A1!` | TOTP Authenticator (or CLI) |

> 💡 **Tip:** To generate the live 6-digit TOTP code for MFA accounts via CLI:
> ```bash
> npx tsx scripts/totp_code.ts founder --confirm-local
> npx tsx scripts/totp_code.ts business_owner --confirm-local
> ```

---

## 🚀 Getting Started (Local Development)

### 1. Prerequisites
- **Node.js** (v20+ recommended)
- **npm** (v10+)
- Access to Supabase or local PostgreSQL instance

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/livmanor/ArchScale-V5.git
cd "ArchScale V5"

# Install dependencies
npm install
```

### 3. Environment Setup
Copy the example environment file and fill in your Supabase connection strings:
```bash
cp .env.example .env
```
Key variables required:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_ADMIN_URL`
- `ARCHSCALE_RUNTIME_DB_URL`

### 4. Running Locally
```bash
# Start backend server (listening on http://localhost:3000)
npm run dev:server

# In a separate terminal, start Vite frontend (http://localhost:5173)
npm run dev:ui
```

### 5. Running Automated Verification Suite
ArchScale includes a 171-test automated suite covering invariant enforcement, RLS boundaries, and authentication flows:
```bash
npm run test
```

---

## 📦 Deployment Workflow

### Backend (Render Web Service)
The backend is configured via [render.yaml](render.yaml):
- **Build Command:** `npm install`
- **Start Command:** `npm start` (or `node dist/index.js`)
- **Host Binding:** `0.0.0.0:10000`
- Set `ARCHSCALE_FRONTEND_URL=https://archscale-v5.vercel.app` to ensure cross-origin preflight requests are accepted.

### Frontend (Vercel SPA)
The frontend is built and served via [vercel.json](vercel.json):
- **Build Command:** `npm run build:ui`
- **Output Directory:** `src/server/public`
- **Environment Variables:**
  - `VITE_API_URL=https://archscale-v5.onrender.com`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

---

## 🔒 Security Highlights

1. **Least-Privilege Database Access:** All API requests establish tenant context via `fn_set_app_context(<context_id>)` and execute strictly under the unprivileged `archscale_app_runtime` database role.
2. **Context-Enforced RLS:** PostgreSQL enforces row isolation at the engine level. No cross-tenant reads or writes are possible even if an API route query omits a `WHERE` clause.
3. **Immutable Audit Logs:** Support grants, tenant status changes, and record updates are written to append-only audit tables protected against modification or deletion.
4. **Separation of Duties:** Members cannot self-approve access requests or invitations. Platform founders cannot execute support modifications without an approved, active support ticket.

---

## 📄 License
UNLICENSED &copy; 2026 ArchScale Platform Team. All rights reserved.

