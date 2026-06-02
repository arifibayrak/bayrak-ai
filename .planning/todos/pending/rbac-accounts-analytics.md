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

## PROGRESS

**DONE — Layer 1: Foundation (commit `d4c4150`, tsc green, migration applied to neondb):**
- `users.role` column (migration `0016_v5_users_role`). Default `office_engineer`.
- `src/lib/authz.ts` (pure): ROLES, `effectiveRole()` (@bayrak.ai⇒admin always; non-@bayrak.ai clamped to never-admin), `canWrite`, `canManageAccounts`, `AUDIT_ALLOWED_PREFIXES` + `auditCanAccessPath()`.
- `src/lib/auth.ts`: session callback sets `session.user.role` every request (trust boundary).
- `src/lib/rbac.ts`: `requireRole/requireAdmin/requireWriteAccess` (page redirect) + `assertCanWrite/assertAdmin` (server-action throw) — READY TO WIRE, not yet used.
- `src/types/next-auth.d.ts`: role on Session/User.
- No enforcement wired yet ⇒ zero behavior change so far.

**REMAINING — wire enforcement + build the panel (start from d4c4150):**
1. **Account panel** `src/app/dashboard/(admin)/settings/users/page.tsx` — `await requireAdmin()` first; list `users` (name/email/role); client role-select per row → new `src/actions/users.ts` `setUserRole(userId, role)` with `assertAdmin()` + invariant (never set admin for non-@bayrak.ai; @bayrak.ai always admin). Add an admin-only link to it from `settings/page.tsx`. i18n TR/EN.
2. **Audit_engineer read-only enforcement:** add `await requireWriteAccess()` at the top of every office-only page RSC — `dashboard/projects` (+ `[id]`, `[id]/edit`, `[id]/boq-template`, `new`), `(admin)/hakedis` (+`[periodId]`), `(admin)/exports`, `(admin)/requests`, `(admin)/people` (+`[personId]`), `(admin)/settings` (+`users`=requireAdmin). Leave overview/records/analytics open to all.
3. **Write-action guards:** add `await assertCanWrite()` after `auth()` in every mutating Server Action: `actions/projects.ts`, `actions/boq.ts`, `actions/people.ts` (approve/reject/manual/assign), `actions/hakedis.ts` (create/finalize/delete/recompute), `actions/chainage.ts` (setChainageOffset), `actions/settings.ts`. (`users.ts` uses `assertAdmin`.)
4. **Nav:** pass role from `dashboard/layout.tsx` → `AppSidebar`/`SidebarNav`; hide office-only items for audit_engineer; show the account-panel link to admin only.
5. Verify: `tsc` + `next build` + `vitest run` (baseline 416; add tests: non-@bayrak.ai never admin, setUserRole admin-guard, assertCanWrite blocks audit_engineer). Deploy `vercel --prod`.

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

## RESOLVED (decided 2026-06-02 — build exactly these, no further questions)
- **Scope this milestone = RBAC core + account panel ONLY.** "Finish Analizler" is a SEPARATE follow-up; do not build analytics here.
- **Audit-engineer web surfaces = READ-ONLY monitoring.** Allowed routes: `/dashboard/overview`, `/dashboard/records` (+ `/records/[id]`), `/dashboard/analytics` (+ scorecard pages). DENIED: projects create/edit/delete, hakedis, exports, requests, settings, AND all write Server Actions.
- **Web `audit_engineer` accounts are INDEPENDENT** of Telegram `people` rows (no identity link in v1).
- **Default role for a new non-`@bayrak.ai` login = `office_engineer`** (the allowlist already gates who can log in at all).
- **"Deactivate/remove account" is OUT of scope** for v1 — panel does role view + role change only.

## How a fresh session should build this
Run from a NEW conversation (main agent has Bash + full context — subagents are Bash-restricted here and cannot build/verify). Prompt: "Build the RBAC milestone exactly per `.planning/todos/pending/rbac-accounts-analytics.md`." Then verify (tsc / next build / `vitest run` baseline 416) and commit atomically. Do NOT use `drizzle-kit push` (use `migrate.ts`, D-49). Deploy via `vercel --prod` (CLI may stall on api.vercel.com DNS — builds still complete server-side; dashboard Redeploy is the fallback).

## Context for the build session
- Today: NO roles, NO middleware; every allowlisted magic-link user has FULL access (10 `auth()` page guards, no authorization).
- Web users = Auth.js `users`; field workers/auditors = `people` (Telegram). The bot is already role-aware (worker vs auditor home).
- Dev and prod share one Neon DB (`neondb`) — migrations hit prod (see memory dev-prod-share-one-db). Deploy: `vercel --prod` (CLI can stall on api.vercel.com DNS in-sandbox; builds still complete server-side / use dashboard Redeploy as fallback).
