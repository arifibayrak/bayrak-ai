---
phase: 1
slug: foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-24
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (latest) — fast, Vite-native, works with TS + Next.js |
| **Config file** | none yet — Wave 0 installs `vitest` + `vitest.config.ts` |
| **Quick run command** | `npx vitest run --changed` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10–20 seconds (unit + light DB integration) |

DB-dependent tests run against a Neon branch / local Postgres with PostGIS; gate them behind a `DATABASE_URL` env check so unit tests stay runnable without a DB.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --changed`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

> Task rows are populated during planning/execution (task IDs assigned by the planner). The validation behaviors below (from RESEARCH.md ## Validation Architecture) are the required coverage; the planner must attach each to a task or Wave 0 stub.

| Behavior | Requirement | Test Type | Automated Command | Status |
|----------|-------------|-----------|-------------------|--------|
| PostGIS extension present after migrations (`SELECT postgis_version()` succeeds) | SETUP-03 | integration | `npx vitest run db/postgis` | ⬜ pending |
| Route stored as `geometry(LineString,4326)`; coordinate order preserved (Istanbul reads back lng 28.9 first in GeoJSON) | SETUP-03 | unit/integration | `npx vitest run geo/coordinate-order` | ⬜ pending |
| GeoJSON upload rejects non-LineString / non-WGS84 with a clear error; accepts a valid LineString | SETUP-03 | unit | `npx vitest run geo/geojson-validate` | ⬜ pending |
| Magic-link allowlist: non-allowlisted email is blocked (no email sent, no session); allowlisted succeeds | AUTH-01 | integration | `npx vitest run auth/allowlist` | ⬜ pending |
| `/start` upsert is idempotent: same Telegram update twice → exactly one `pending_people` row | AUTH-02, AUTH-03 | integration | `npx vitest run bot/start-idempotent` | ⬜ pending |
| Person approval promotes pending → active with role; assignment to project persists | AUTH-02, AUTH-03, AUTH-04 | integration | `npx vitest run people/approve` | ⬜ pending |
| BOQ Excel import parses template, normalizes Turkish decimals, preview matches committed rows | SETUP-02 | unit | `npx vitest run boq/excel-import` | ⬜ pending |
| Manual BOQ CRUD: create/edit line item; remaining balance derived correctly | SETUP-02, SETUP-04 | integration | `npx vitest run boq/crud` | ⬜ pending |
| Project CRUD persists with nullable `tenant_id` defaulted to the single seed tenant | SETUP-01 | integration | `npx vitest run projects/crud` | ⬜ pending |
| Dashboard locale toggle persists (cookie) and renders TR default / EN switch | I18N-02 | unit | `npx vitest run i18n/toggle` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest` + `vitest.config.ts` installed (no framework exists yet — greenfield)
- [ ] Test DB bootstrap helper (Neon branch or local Postgres+PostGIS) + `DATABASE_URL`-gated integration setup
- [ ] Shared fixtures: seed tenant, seed allowlisted office user, sample valid/invalid GeoJSON, sample BOQ `.xlsx`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real magic-link email delivery (Resend) | AUTH-01 | External email provider; not worth mocking end-to-end in v1 | Request a link for an allowlisted address, confirm receipt + successful sign-in |
| Real Telegram `/start` from a phone reaches the webhook | AUTH-02 | Requires a live bot token + public webhook URL | Send `/start` to the bot; confirm a `pending_people` row appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
