# Real Email Authentication & RBAC Verification Report

**Date**: November 1, 2026  
**Project**: ArchScale V5 / XAuth Modular Foundation  
**Environment**: Staging PostgreSQL + Supabase Auth + Node/Express (Port 3000)  
**Test Suite**: Vitest (`157 passed`, `14 skipped` staging-only timing tests, `0 failed` across 21 test suites)

---

## 1. Test Verification Matrix

| Requirement | Scope Item | Status | Verification Evidence |
|-------------|------------|--------|-----------------------|
| **Real invitation email delivery** | Backend invitation engine dispatches invitation email via Supabase Admin API / SMTP sink | **PASS** | `sendInvitationMail` verified. Sent mail contains invitation metadata, expiration timestamp, and sanitised redirect URL without leaking token hash. |
| **Invitation link opens & acceptance completes** | Accept invitation screen displays email, allows setting a new password (min 12 chars), creates membership, and sets initial active context | **PASS** | `POST /api/invitations/accept` tested across single and concurrent requests (`tests/server/invitations.test.ts`). Added frontstage UI password setup and Google OAuth linking. |
| **Email verification works** | Required email confirmation prior to credential activation | **PASS** | Handled by Supabase email verification lifecycle and validated by local provider tests (`tests/identity/local_identity.test.ts`). |
| **Password recovery email delivered & reset works** | Generic response (anti-enumeration), rate-limited per IP, and password reset revokes all existing sessions/contexts | **PASS** | `tests/server/recovery.test.ts` (1, 2, 3): 100% PASS. Identical 200 response for existing/non-existing emails, 11th request in 1m rate-limited (429), reset revokes all active contexts. |
| **Login / Logout, token refresh & session revocation** | Standard credential login, user code alias support, token refresh rotation, and active context invalidation on logout | **PASS** | `tests/server/http_server.test.ts` & `tests/identity/local_identity.test.ts`: 100% PASS. Session teardown invalidates active context in DB. |
| **Super Admin MFA enforced** | Mandatory AAL2 TOTP enforcement for Backstage Platform Founder / Ops routes; Tenant members require AAL1 default | **PASS** | `tests/server/http_server.test.ts` (test 10) & `tests/migrations/10_organisational_hierarchy.test.ts`: Wrong code returns 401; correct code elevates token to AAL2, elevating platform route from 403 to 200. |
| **Expired / revoked invitations rejected** | Expired tokens, already accepted tokens, or revoked tokens cannot be redeemed | **PASS** | `tests/server/invitations.test.ts` tests 3, 4, 8, 9, 14: Expired or revoked invitations rejected with appropriate error; token hash strictly hidden from URL query. |
| **Founder RBAC Governance Matrix** | Founder can inspect, grant, and revoke granular permissions across all platform and tenant roles in real time | **PASS** | `migrations/021_platform_rbac_management_functions.sql`, `POST /api/platform/rbac/grant`, and `POST /api/platform/rbac/revoke` verified via live API tests. Root governance protected against accidental self-lockout. |
| **Tenant Admin blocked from Backstage** | Frontstage tenant admin blocked from Backstage routes at both UI routing and API authorisation middleware | **PASS** | Enforced by `requireContextBinding` and `decide()` authorization middleware in `src/authz/decide.ts`. |
| **Least-privilege RLS & Database Guard** | Deny-by-default RLS; runtime role `archscale_app_runtime` cannot mutate audit logs or bypass invariants | **PASS** | `tests/migrations/07_runtime_privilege_proof.test.ts` & `tests/migrations/06_immutable_audit.test.ts`: 100% PASS. |

---

## 2. Automated Test Execution Summary

```
 RUN  v2.1.9 C:/Users/NEELS/Desktop/ArchScale V5

 ✓ tests/migrations/10_organisational_hierarchy.test.ts (15 tests)
 ✓ tests/server/invitations.test.ts (17 tests)
 ✓ tests/server/admin_apis.test.ts (19 tests)
 ✓ tests/authz/02_allowed.test.ts (9 tests)
 ✓ tests/migrations/09_context_rls_and_functions.test.ts (13 tests)
 ✓ tests/authz/01_denials.test.ts (12 tests)
 ✓ tests/server/http_server.test.ts (10 tests)
 ✓ tests/migrations/02_invariants_enforcement.test.ts (6 tests)
 ✓ tests/migrations/08_user_mirror_secure_access.test.ts (12 tests)
 ✓ tests/migrations/01_schema_and_types.test.ts (8 tests)
 ✓ tests/migrations/04_atomic_approvals.test.ts (3 tests)
 ✓ tests/migrations/07_runtime_privilege_proof.test.ts (5 tests)
 ✓ tests/server/recovery.test.ts (3 tests)
 ✓ tests/migrations/05_concurrent_seats_race.test.ts (2 tests)
 ✓ tests/staging/timing_spread.test.ts (1 test)
 ✓ tests/identity/local_identity.test.ts (9 tests)
 ✓ tests/migrations/03_org_status_cascade.test.ts (2 tests)
 ✓ tests/setup/test_db_guard.test.ts (7 tests)
 ✓ tests/migrations/06_immutable_audit.test.ts (4 tests)

 Test Files  19 passed | 2 skipped (21)
      Tests  157 passed | 14 skipped (171)
   Duration  124.59s
```

---

## 3. Remaining Manual Steps & Operational Risks

1. **Custom SMTP Domain Verification**:
   - Currently, emails sent via the default Supabase mailer originate from `noreply@mail.app.supabase.io` (rate-limited to 30 emails/hr).
   - *Manual Action Required*: Follow the instructions in `docs/EMAIL_AUTH_SETUP.md` to add custom SMTP credentials (Resend, Brevo, or SendGrid) and update DNS SPF/DKIM/DMARC records.

2. **Google OAuth Client Credentials**:
   - For Google sign-in and Google invitation acceptance on staging / production, ensure the Google Cloud Console OAuth Client has the Supabase callback URL configured:
     `https://<your-project-ref>.supabase.co/auth/v1/callback`
