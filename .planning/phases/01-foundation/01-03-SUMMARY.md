---
phase: 01-foundation
plan: "03"
subsystem: auth-i18n
tags: [auth, magic-link, allowlist, next-intl, i18n, dashboard-guard, top-nav]
dependency_graph:
  requires: [01-02a]
  provides: [guarded-dashboard-layout, magic-link-auth, tr-en-locale-switching, top-nav]
  affects: [01-05, 01-06]
tech_stack:
  added: [next-auth@5-beta, "@auth/drizzle-adapter", resend, next-intl]
  patterns: [allowlist-signin-callback, cookie-locale-switching, server-action-signout]
key_files:
  created:
    - src/lib/auth-allowlist.ts
    - src/lib/auth.ts
    - src/app/api/auth/[...nextauth]/route.ts
    - src/app/auth/signin/page.tsx
    - src/app/auth/error/page.tsx
    - src/app/dashboard/layout.tsx
    - src/components/layout/LanguageToggle.tsx
    - src/components/layout/TopNav.tsx
    - tests/auth.test.ts
    - tests/i18n.test.ts
  modified:
    - messages/tr.json
    - messages/en.json
    - src/i18n/request.ts
    - src/app/layout.tsx
decisions:
  - "isAllowed() is a pure exported helper in auth-allowlist.ts — no Auth.js runtime dependency enables fast unit tests (D-11)"
  - "signIn callback blocks on both the verificationRequest call and the link-click call (Pitfall 2 pattern)"
  - "LanguageToggle sets cookie then reloads — server-side getRequestConfig picks up the value without client-side locale provider complexity"
  - "TopNav is a Server Component reading locale via getLocale(); passes it down to the client-only LanguageToggle"
  - "Sign-out uses a Server Action form (no client-side signOut(); keeps the signOut call server-side)"
metrics:
  duration: "~45 minutes (continuation executor completing partial prior work)"
  completed: "2026-05-24"
  tasks_completed: 2
  files_created: 10
  files_modified: 4
  tests_passing: 16
---

# Phase 1 Plan 03: Auth.js allowlist magic-link + TR/EN i18n + Dashboard guard Summary

**One-liner:** Auth.js v5 magic-link gated to `AUTH_ALLOWED_EMAILS` allowlist with DrizzleAdapter + Resend, guarded `/dashboard/*` layout with sticky TopNav, and cookie-based TR-default/EN-switch i18n with 89-key message catalogs and parity guard.

---

## Tasks Completed

| Task | Description | Commit | Tests |
|------|-------------|--------|-------|
| RED gate | auth allowlist failing tests | 4d021e5 | 8 tests RED |
| Task 1 | Auth.js allowlist + sign-in/error pages + dashboard guard | b259cf3 | 8/8 GREEN |
| Task 2 | next-intl locale + message catalogs + LanguageToggle + TopNav | 30104b3 | 8/8 GREEN |
| chore | drizzle migrations/meta from 01-02a | c0d616e | — |

---

## What Was Built

### Task 1: Auth.js Allowlist Magic-Link (GREEN — b259cf3)

**src/lib/auth-allowlist.ts** — pure `isAllowed(email: string): boolean` helper. Reads `AUTH_ALLOWED_EMAILS` (comma-separated, case-insensitive, whitespace-trimmed). Returns false for empty email or unset env var. No Auth.js runtime dependency — safely unit-tested in Vitest/Node.

**src/lib/auth.ts** — NextAuth v5 config:
- `DrizzleAdapter(db, {usersTable, accountsTable, sessionsTable, verificationTokensTable})`
- `Resend` provider (`from: no-reply@bayrak.ai`, `apiKey: AUTH_RESEND_KEY`)
- `signIn` callback: `return isAllowed(user.email)` — blocks on BOTH the verificationRequest call and the link-click call (T-03-01 mitigated, D-11 enforced)
- `pages: { signIn: '/auth/signin', error: '/auth/error' }`
- Re-exports `isAllowed` for convenience

**src/app/api/auth/[...nextauth]/route.ts** — exports `{ GET, POST }` from handlers.

**src/app/auth/signin/page.tsx** — magic-link sign-in card (UI-SPEC #1): display heading, "Ofis Girişi / Office Sign-In" subheading, email input, full-width CTA, helper text. Loading/success/error states. Calls `signIn('resend', { callbackUrl: '/dashboard/projects' })`. All copy via i18n keys (`auth.signin.*`).

**src/app/auth/error/page.tsx** — access-denied error page using `auth.signin.error_not_allowed`. Handles `AccessDenied` and `Verification` error types from Auth.js.

**src/app/dashboard/layout.tsx** — session guard: `const session = await auth(); if (!session) redirect('/auth/signin');`. Then renders `<TopNav userEmail={session.user?.email} />` + children. T-03-02 mitigated.

**tests/auth.test.ts** — 8 unit tests: non-allowlisted → false, allowlisted exact match → true, case-insensitive UPPER input → true, case-insensitive mixed-case env list → true, empty string → false, unset env → false, whitespace-padded entries → true, second non-allowlisted in multi-entry list → false.

### Task 2: next-intl Cookie Locale + Message Catalogs + LanguageToggle + TopNav (GREEN — 30104b3)

**src/i18n/request.ts** — (already wired in prior partial work): `getRequestConfig` reads `locale` cookie via `await cookies()`, defaults to `'tr'`, dynamically imports `../../messages/${locale}.json`.

**src/app/layout.tsx** — (already wired in prior partial work): `NextIntlClientProvider` with `getLocale()`/`getMessages()`, `<html lang={locale}>`, Geist Sans font.

**messages/tr.json + messages/en.json** — 89 keys across `auth.signin.*`, `nav.*`, `dashboard.projects.*`, `dashboard.boq.*`, `dashboard.route.*`, `dashboard.people.*`, `common.*`. Covers every string in the UI-SPEC Copywriting Contract. Key parity: 89 keys in both files (verified via flat-key parity check).

**src/components/layout/LanguageToggle.tsx** — client component. TR|EN pill (h-9 / 36px, rounded-full, pill shape). Each segment is a `<button>` with `aria-pressed`. Sets `document.cookie = locale=...; path=/; max-age=31536000; SameSite=Lax` then `window.location.reload()`. `role="group"` container with `aria-label` from `nav.language_toggle_label`. Active segment: `bg-primary text-primary-foreground`; inactive: `bg-muted text-muted-foreground`.

**src/components/layout/TopNav.tsx** — Server Component. `sticky top-0 z-40 h-14 bg-card border-b border-border`. Left: wordmark from `nav.wordmark`. Right: `<LanguageToggle currentLocale={locale}>` + user email (hidden on mobile) + sign-out button (Server Action form calling `signOut({ redirectTo: '/auth/signin' })`). All text via `getTranslations('nav')`.

**tests/i18n.test.ts** — 8 tests: locale resolution logic (tr on undefined, en on 'en', tr on 'tr', passthrough on 'xx'); key parity (identical key sets, size > 20); auth.signin required keys; nav required keys; dashboard required CTAs.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test isolation failure with vi.mock() + vi.resetModules()**
- **Found during:** Task 2 test authoring
- **Issue:** Initial i18n tests used `vi.mock('next/headers', ...)` with `vi.resetModules()` to test locale resolution. The third test's mock for `locale=xx` leaked into earlier tests via Vitest's module cache, causing tests 1 and 2 to assert `'xx'` instead of `'tr'`/`'en'`.
- **Fix:** Replaced runtime-dependent mock tests with pure logic tests — extracted the `resolveLocale(cookieValue: string | undefined): string` logic (which mirrors `request.ts` exactly: `cookieValue ?? 'tr'`) and tested that directly. This is a stricter, more reliable test of the same invariant without any mocking complexity.
- **Files modified:** tests/i18n.test.ts
- **Commit:** 30104b3

### Structural Notes (not deviations)

- `src/i18n/request.ts` and `src/app/layout.tsx` were already correctly wired by the prior partial executor. No changes needed beyond the message catalog expansion.
- `src/db/migrations/meta/` was untracked leftover from plan 01-02a — committed in a separate chore commit (c0d616e) per the resume instructions.

---

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (test) | 4d021e5 | PASS — test(01-03): add failing auth allowlist tests |
| GREEN Task 1 (feat) | b259cf3 | PASS — feat(01-03): auth.js allowlist magic-link + guarded dashboard layout |
| GREEN Task 2 (feat) | 30104b3 | PASS — feat(01-03): next-intl cookie locale + message catalogs + LanguageToggle + TopNav |

---

## Security / Threat Model Coverage

| Threat ID | Status | Evidence |
|-----------|--------|----------|
| T-03-01 Spoofing (allowlist) | Mitigated | `isAllowed()` blocks both verificationRequest and link-click; 8 unit tests |
| T-03-02 EoP (/dashboard/* access) | Mitigated | `dashboard/layout.tsx` calls `auth()` and redirects unauthenticated requests |
| T-03-03 Info Disclosure (allowlist) | Mitigated | `AUTH_ALLOWED_EMAILS` env-only; error page shows generic "not authorized" copy |
| T-03-04 Spoofing (AUTH_SECRET) | Mitigated | AUTH_SECRET in .env.local (gitignored); generated via `openssl rand -base64 32` |

---

## Known Stubs

None — all components are wired with real i18n keys and real auth logic. No placeholder data flowing to UI.

---

## Self-Check: PASSED

Files verified present:
- src/lib/auth-allowlist.ts: FOUND
- src/lib/auth.ts: FOUND
- src/app/api/auth/[...nextauth]/route.ts: FOUND
- src/app/auth/signin/page.tsx: FOUND
- src/app/auth/error/page.tsx: FOUND
- src/app/dashboard/layout.tsx: FOUND
- src/components/layout/LanguageToggle.tsx: FOUND
- src/components/layout/TopNav.tsx: FOUND
- tests/auth.test.ts: FOUND
- tests/i18n.test.ts: FOUND

Commits verified:
- 4d021e5 RED gate: FOUND
- b259cf3 Task 1 GREEN: FOUND
- 30104b3 Task 2 GREEN: FOUND
- c0d616e migrations/meta chore: FOUND

Tests: 16/16 PASS (auth 8/8, i18n 8/8)
Key parity: 89/89 keys matched
