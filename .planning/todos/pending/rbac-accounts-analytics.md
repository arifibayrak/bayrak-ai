---
title: RBAC + Account Management Panel + finish Analizler
status: pending
priority: high
created: 2026-06-02
area: auth / admin / analytics
origin: user request 2026-06-02 — role-based access, account panel, finish Analytics
note: SECURITY-CRITICAL (auth). Build in a fresh session with full context. Suggest /gsd-new-milestone (v5.0) or /gsd-plan-phase.
---

# Milestone: Role-Based Access Control + Account Management + Analizler

Net-new beyond the v4.0 roadmap. Three pieces. Build RBAC FIRST (everything else gates on it).

## LOCKED DECISIONS (from user, 2026-06-02)

**Roles (3):** `admin`, `office_engineer`, `audit_engineer`.

- **Admin** = Arif & Mehmet. **Only `@bayrak.ai` emails may be admin.** Full access including the account panel.
- **Office engineer** = full access to everything (projects, BOQ, people, hakkediş incl. finalize, exports, settings) **EXCEPT** user/account management (admin-only).
- **Audit engineer** = **limited web access**: their audit queue + their own scorecard/records only. No project/BOQ/hakkediş editing.
- **Entrance rule:** keep the magic-link + `AUTH_ALLOWED_EMAILS` allowlist. On login, assign role by email: `@bayrak.ai` → admin; everyone else → office_engineer or audit_engineer (assigned in the panel; default office_engineer or a pending/least-privilege state — decide at build).
- **Account panel location:** dedicated **admin-only `/dashboard/settings/users`** page (NOT the People page — keep web accounts separate from Telegram field people).

## Build outline

1. **Schema** — add `role text not null default 'office_engineer'` to `users` (Auth.js). Migration via `src/db/migrate.ts` (applies to the shared neondb + neondb_test). Values: admin | office_engineer | audit_engineer.
2. **Role assignment at login** — in `src/lib/auth.ts` signIn/session callbacks: on first sign-in set role (`@bayrak.ai` → admin, else default). Expose `session.user.role`. Never let a non-`@bayrak.ai` email become admin (enforce server-side, not just UI).
3. **Authorization layer** — a `can(role, action)` / `requireRole()` helper in `src/lib/`. Enforce in BOTH page RSCs and every Server Action (defense in depth — UI hiding is not enough). Account-mgmt actions: admin-only. Audit-engineer: allow only their queue/scorecard/records routes; deny/redirect the rest.
4. **Nav + guards** — SidebarNav hides sections the role can't use; add a guard (middleware or per-page `requireRole`) so audit engineers can't reach office/admin routes by URL.
5. **Account panel** — `/dashboard/settings/users` (admin-only): list `users` (name, email, role, last login), change role (office_engineer ↔ audit_engineer; admin only for `@bayrak.ai`), and optionally activate/deactivate. Server actions admin-guarded.
6. **Analizler finish** — replace the stub/coming-soon with real analytics: portfolio trends, per-role insights, charts (reuse Phase 9 analytics queries / TrendChartsClient). Define exact widgets at build.
7. i18n (TR/EN), tests (`vitest run` must stay green — baseline 416), `tsc`, `npm run build`, deploy.

## OPEN QUESTIONS to resolve at build time
- Exact audit-engineer web surfaces (which pages + which records they see — only their own decisions? all in their projects?).
- Do `audit_engineer` web users link to a `people` (Telegram auditor) row, or are they independent web accounts? (Identity mapping.)
- Default role for a brand-new non-`@bayrak.ai` login: office_engineer vs a least-privilege "pending" state an admin must promote.
- Whether "deactivate / remove account" is in-scope for v1 of the panel.

## Context for the build session
- Today: NO roles, NO middleware; every allowlisted magic-link user has FULL access (10 `auth()` page guards, no authorization).
- Web users = Auth.js `users`; field workers/auditors = `people` (Telegram). The bot is already role-aware (worker vs auditor home).
- Dev and prod share one Neon DB (`neondb`) — migrations hit prod (see memory dev-prod-share-one-db). Deploy: `vercel --prod` (CLI can stall on api.vercel.com DNS in-sandbox; builds still complete server-side / use dashboard Redeploy as fallback).
