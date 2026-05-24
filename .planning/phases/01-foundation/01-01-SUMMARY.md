---
phase: 01-foundation
plan: "01"
subsystem: scaffold
tags: [next.js, drizzle, shadcn, vitest, next-intl, setup]
dependency_graph:
  requires: []
  provides:
    - package.json with all Phase 1 deps at pinned versions
    - Next.js 15.5.18 App Router buildable project
    - shadcn/ui neutral initialized with full Phase 1 component set
    - Drizzle client (src/db/index.ts) bound to DATABASE_URL via Neon
    - drizzle-kit config pointing to schema + migrations
    - next.config.ts with next-intl plugin + serverExternalPackages
    - vercel.json with telegram function override
    - .env.example documenting all 9 Phase 1 secrets
    - Vitest harness (passWithNoTests) + shared fixtures
  affects:
    - All Phase 1 plans (01-02 through 01-07) depend on this scaffold
tech_stack:
  added:
    - next@15.5.18 (App Router, TypeScript, Tailwind 4)
    - drizzle-orm@0.45.x + drizzle-kit@0.31.x
    - @neondatabase/serverless@1.1.x
    - next-auth@5.0.0-beta.31
    - @auth/drizzle-adapter@1.11.x
    - grammy@1.43.x
    - next-intl@4.12.x
    - zod@4.4.3
    - exceljs@4.4.x
    - react-hook-form@7.76.x
    - @vercel/blob@2.4.x
    - wkx@0.5.x
    - vitest@4.x + @vitest/coverage-v8
    - shadcn/ui neutral (16 components)
  patterns:
    - Next.js App Router monolith on Vercel
    - Drizzle ORM with Neon serverless driver
    - next-intl cookie-based locale (no URL prefix)
    - Vitest with passWithNoTests + @/* path alias
key_files:
  created:
    - package.json
    - tsconfig.json
    - next.config.ts
    - drizzle.config.ts
    - vercel.json
    - .env.example
    - .gitignore
    - components.json
    - src/app/layout.tsx
    - src/app/globals.css
    - src/db/index.ts
    - src/i18n/request.ts
    - messages/tr.json
    - messages/en.json
    - tests/setup.ts
    - tests/fixtures/db.ts
    - tests/fixtures/geojson.ts
    - tests/fixtures/boq.ts
    - vitest.config.ts
    - src/components/ui/ (16 components)
  modified: []
decisions:
  - "zod@4.4.3 installed (4.x line, not 3.x — latest stable tag per npm)"
  - "shadcn form.tsx created manually (shadcn v4.8 CLI returns immediately for form with no file output; react-hook-form integration provided via custom component)"
  - ".gitignore tightened: .env*.local blocks secrets; .env.example allowed"
  - "vitest passWithNoTests=true required for v4.x (exits code 1 with no test files without this flag)"
  - "build script uses webpack (not --turbopack) — Turbopack port-binding blocked in sandbox"
metrics:
  duration: "18 minutes"
  completed: "2026-05-24"
  tasks_completed: 3
  files_created: 25
---

# Phase 01 Plan 01: Project Scaffold + Dependencies + Test Harness Summary

**One-liner:** Next.js 15.5.18 App Router scaffolded with all Phase 1 deps at verified versions, shadcn/ui neutral with 16 components, Drizzle + Neon client wired, next-intl plugin active, Vitest harness with shared GeoJSON/BOQ/DB-gated fixtures ready for downstream plans.

## What Was Built

### Task 1: Next.js 15 scaffold + all Phase 1 deps + shadcn/ui neutral

- Scaffolded Next.js 15.5.18 with TypeScript, Tailwind 4, App Router, src/ layout into the existing project directory (preserving `.planning/`, `CLAUDE.md`, `.git`)
- Installed all Phase 1 runtime deps: drizzle-orm, next-auth beta.31, grammy, next-intl, exceljs, zod@4.4.3, resend, @vercel/blob, react-hook-form, wkx, @neondatabase/serverless, pg
- Installed dev deps: drizzle-kit, @types/pg, vitest, @vitest/coverage-v8
- shadcn/ui initialized (neutral base color) with all 16 Phase 1 components: button, input, label, table, card, badge, dialog, tabs, form, separator, dropdown-menu, select, alert, progress, skeleton, sonner
- `npx next build` passes cleanly (webpack mode)

### Task 2: Build-level integration points + Drizzle client + env layout

- `next.config.ts`: `serverExternalPackages: ['grammy', 'pg']`; wrapped with `createNextIntlPlugin('./src/i18n/request.ts')`
- `drizzle.config.ts`: dialect postgresql, schema `./src/db/schema/*.ts`, out `./src/db/migrations`, credentials from `DATABASE_URL`
- `vercel.json`: telegram webhook function override (memory: 512, maxDuration: 55)
- `src/db/index.ts`: Drizzle client via `drizzle(neon(DATABASE_URL!))`; exported as `db` for `@/db` import
- `.env.example`: all 9 Phase 1 env vars documented with placeholder values and comments
- `src/i18n/request.ts`: next-intl `getRequestConfig` reading locale cookie (TR default per I18N-02)
- `messages/tr.json` + `messages/en.json`: Phase 1 i18n strings
- `src/app/layout.tsx`: wired `NextIntlClientProvider` with `getLocale()`/`getMessages()`
- `.gitignore` tightened: `.env*.local` blocked; `.env.example` committed

### Task 3: Vitest harness + shared fixtures (Wave 0)

- `vitest.config.ts`: node environment, globals true, `@/*` alias, setupFiles, `passWithNoTests: true`
- `tests/setup.ts`: minimal global setup (no watch mode)
- `tests/fixtures/db.ts`: `hasTestDb` flag, `describeIfDb` guard (skips when `TEST_DATABASE_URL` unset), `getTestDb()`, `truncateAllTables()`
- `tests/fixtures/geojson.ts`: valid LineString Feature (Istanbul lng=28.9 first), invalid Polygon FeatureCollection, lat-first-out-of-range fixture
- `tests/fixtures/boq.ts`: `createValidBoqBuffer()` (3 rows including Turkish decimal "123,5"), `createInvalidBoqBuffer()` (missing material/unit/invalid qty)
- `npx vitest run` exits 0 cleanly

## Commits

| Commit | Description |
|--------|-------------|
| 7abf25c | feat(01-01): scaffold Next.js 15.5.18 + all Phase 1 deps + shadcn/ui neutral |
| e6734c5 | feat(01-01): wire next-intl plugin + serverExternalPackages + Drizzle client + env layout |
| c6f7a04 | chore(01-01): allow .env.example in git; tighten .gitignore to .env*.local |
| 76da0ec | feat(01-01): Vitest harness + shared fixtures (Validation Wave 0) |
| d193b6f | fix(01-01): vitest passWithNoTests=true so empty test suite exits 0 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed escaped `!` characters in form.tsx**
- **Found during:** Task 1 (build verification)
- **Issue:** Shell heredoc created form.tsx with `\!` instead of `!` (bash history expansion escape), causing TypeScript compile errors
- **Fix:** Rewrote form.tsx using the Write tool; all `!` characters correct
- **Files modified:** src/components/ui/form.tsx
- **Commit:** 7abf25c

**2. [Rule 1 - Bug] shadcn form component not generated by CLI**
- **Found during:** Task 1 (component verification)
- **Issue:** `shadcn add form` returned exit 0 but generated no file in shadcn v4.8 (form is provided differently in the new shadcn architecture)
- **Fix:** Created form.tsx manually following the standard shadcn form pattern with react-hook-form integration
- **Files modified:** src/components/ui/form.tsx
- **Commit:** 7abf25c

**3. [Rule 1 - Bug] Missing @radix-ui/react-label dependency**
- **Found during:** Task 1 (build verification)
- **Issue:** shadcn form.tsx imports `@radix-ui/react-label` which was not installed
- **Fix:** `npm install @radix-ui/react-label`
- **Commit:** 7abf25c

**4. [Rule 3 - Blocking] vitest v4 exits code 1 with no test files**
- **Found during:** Task 3 (overall verification)
- **Issue:** vitest v4.x changed behavior to exit code 1 when no test files match (previously exited 0)
- **Fix:** Added `passWithNoTests: true` to vitest.config.ts
- **Files modified:** vitest.config.ts
- **Commit:** d193b6f

**5. [Rule 3 - Blocking] Turbopack port-binding blocked in build sandbox**
- **Found during:** Task 1 (build verification)
- **Issue:** `next build --turbopack` tries to bind a port (sandbox restriction); fails with "Operation not permitted"
- **Fix:** Removed `--turbopack` flag from build script; webpack build passes cleanly
- **Files modified:** package.json
- **Commit:** 7abf25c

**6. [Rule 2 - Missing critical] .gitignore was too broad (blocked .env.example commit)**
- **Found during:** Task 2 (commit)
- **Issue:** Default `.env*` pattern in .gitignore also blocked `.env.example` (which should be committed)
- **Fix:** Changed to `.env*.local` and `.env.local` only; `.env.example` now committable
- **Files modified:** .gitignore
- **Commit:** c6f7a04

**7. [Rule 2 - Missing critical] i18n message files and request.ts needed for build**
- **Found during:** Task 2
- **Issue:** Plan Task 2 creates `src/i18n/request.ts` (correctly), but next-intl plugin also requires message JSON files at build time
- **Fix:** Created `messages/tr.json` and `messages/en.json` with Phase 1 strings; updated `src/app/layout.tsx` with NextIntlClientProvider
- **Files modified:** messages/tr.json, messages/en.json, src/app/layout.tsx
- **Commit:** e6734c5

## Known Stubs

None — this plan creates infrastructure only (no UI rendering, no data-connected components).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: secrets-gitignore | .gitignore | Tightened from `.env*` to `.env*.local` — `.env.example` now committed; real secrets in `.env.local` remain blocked |

## Self-Check: PASSED

All files verified to exist:
- package.json: present
- next.config.ts: present (createNextIntlPlugin + serverExternalPackages)
- drizzle.config.ts: present
- vercel.json: present
- src/db/index.ts: present
- .env.example: present (9 env vars documented)
- components.json: present (neutral base color)
- src/components/ui/: 16 components present
- vitest.config.ts: present
- tests/setup.ts: present
- tests/fixtures/db.ts: present (describeIfDb exported)
- tests/fixtures/geojson.ts: present
- tests/fixtures/boq.ts: present

All commits verified present in git log.
`npx next build` exits 0.
`npx vitest run` exits 0.
`npx tsc --noEmit` exits 0.
