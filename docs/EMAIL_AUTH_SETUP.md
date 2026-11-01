# Real Email Authentication Setup Guide

This guide details the complete configuration for real email delivery, Supabase Auth, SMTP provider setup, DNS records, and local development in the ArchScale / XAuth foundation.

---

## 1. Environment & Secrets Configuration

Create a `.env` file in the repository root by copying `.env.example`:

```bash
cp .env.example .env
```

Ensure `.env` contains the required environment variables:

```env
# Application URLs
ARCHSCALE_FRONTEND_URL=http://127.0.0.1:3000
APP_BASE_URL_BACKSTAGE=http://127.0.0.1:3000
APP_BASE_URL_FRONTSTAGE=http://127.0.0.1:3000

# Supabase Auth & PostgreSQL
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=eyJh...
SUPABASE_SERVICE_ROLE_KEY=eyJh...
SUPABASE_JWT_SECRET=<your-supabase-jwt-secret>

# Custom SMTP Delivery (e.g. Resend, Brevo, or SendGrid)
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_<your-resend-api-key>
SMTP_FROM_EMAIL=auth@yourdomain.com
SMTP_FROM_NAME=ArchScale Auth

# Security & Runtime
NODE_ENV=development
ALLOW_LOCAL_AUTH=false
```

> **Security Invariant**: `SUPABASE_SERVICE_ROLE_KEY` must **only** be configured on the backend server (`src/server/index.ts`). It is excluded from the client build bundle. `.env` is tracked in `.gitignore` and must never be committed.

---

## 2. Supabase Auth Dashboard Configuration

Follow these exact steps in your [Supabase Dashboard](https://supabase.com/dashboard):

### A. Enable Email Provider
1. Navigate to **Authentication** &rarr; **Providers** &rarr; **Email**.
2. Toggle **Enable Email provider** to **ON**.
3. Toggle **Confirm email** to **ON** (requires users to verify their email before sign-in).
4. Set **Secure email change** to **ON**.
5. Click **Save**.

### B. Configure Site URL & Redirect URLs
1. Navigate to **Authentication** &rarr; **URL Configuration**.
2. Set **Site URL** to:
   - Development: `http://127.0.0.1:3000`
   - Production: `https://app.yourdomain.com`
3. Add the following to **Redirect URLs**:
   - `http://127.0.0.1:3000/accept`
   - `http://127.0.0.1:3000/login`
   - `http://127.0.0.1:3000/reset-password`
   - `http://127.0.0.1:3000/verify`
   - `https://app.yourdomain.com/accept`
   - `https://app.yourdomain.com/login`
   - `https://app.yourdomain.com/reset-password`
   - `https://app.yourdomain.com/verify`
4. Click **Save**.

### C. Configure Custom SMTP (Production Deliverability)
Default Supabase email service is strictly rate-limited (30 emails/hour) and sends from `noreply@mail.app.supabase.io`. For production delivery:
1. Navigate to **Project Settings** &rarr; **Authentication** &rarr; **SMTP Settings**.
2. Toggle **Enable Custom SMTP** to **ON**.
3. Enter your SMTP provider credentials:
   - **Sender email**: `auth@yourdomain.com` (or your verified domain sender)
   - **Sender name**: `ArchScale Auth`
   - **Host**: `smtp.resend.com` (or `smtp-relay.brevo.com` / `smtp.sendgrid.net`)
   - **Port**: `587`
   - **Username**: `resend` (or your provider user)
   - **Password**: `<your-smtp-api-key>`
4. Click **Save Changes**.

---

## 3. DNS Records for Domain Verification (SPF, DKIM, DMARC)

To prevent invitation and verification emails from landing in spam or junk folders, add the following DNS records in your domain registrar (e.g., Cloudflare, Route53, Namecheap):

| Type | Host / Name | Value | Priority / TTL | Purpose |
|------|-------------|-------|----------------|---------|
| `TXT` | `@` (or subdomain) | `v=spf1 include:amazonses.com include:resend.com ~all` | Auto / 3600 | SPF Record |
| `CNAME` | `resend._domainkey` | `dkim.resend.com.` | Auto / 3600 | DKIM Signature |
| `TXT` | `_dmarc` | `v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@yourdomain.com` | Auto / 3600 | DMARC Policy |
| `MX` | `mail` | `feedback-smtp.us-east-1.amazonses.com` | 10 | Return-Path |

---

## 4. Supabase Email Template Customization

Navigate to **Authentication** &rarr; **Email Templates**:

### A. "Invite user" Template
- **Subject**: `You've been invited to join {{ .SiteURL }}`
- **Body**:
```html
<h2>Welcome to ArchScale</h2>
<p>You have been invited to join an organisation on ArchScale.</p>
<p><a href="{{ .ConfirmationURL }}">Click here to accept your invitation and set your password</a></p>
<p>If you did not expect this invitation, you can safely ignore this email.</p>
```

### B. "Confirm signup" Template
- **Subject**: `Confirm your ArchScale account`
- **Body**:
```html
<h2>Verify Your Email</h2>
<p>Please confirm your account by clicking the link below:</p>
<p><a href="{{ .ConfirmationURL }}">Verify My Email</a></p>
```

### C. "Reset password" Template
- **Subject**: `Reset your ArchScale password`
- **Body**:
```html
<h2>Password Reset Request</h2>
<p>We received a request to reset your password. Click the link below to set a new password:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
<p>This link expires in 60 minutes. If you did not request this, please contact your security administrator.</p>
```

---

## 5. Local Execution Instructions

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Build frontend assets**:
   ```bash
   npm run build:ui
   ```

3. **Start the backend server**:
   ```bash
   npm run server
   ```
   The application will be live at `http://127.0.0.1:3000`.

4. **Run the test suite**:
   ```bash
   npm test
   ```

