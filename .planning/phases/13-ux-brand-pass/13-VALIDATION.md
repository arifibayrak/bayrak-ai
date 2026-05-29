---
phase: 13
slug: ux-brand-pass
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-29
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `13-RESEARCH.md` §Validation Architecture.
>
> **Phase 13 is restyling-only — no functional regression to v1/v2/v3.0 capabilities.** That guarantee is the verification anchor: behavior tests stay, pixel tests are NOT introduced. UAT covers the visual half.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.7 [VERIFIED in package.json] + existing test setup from Phases 1–12 |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `npx vitest run <pattern>` |
| **Full suite command** | `npx vitest run` (covers all 351+ existing tests from Phases 1–12) |
| **Test environment** | `environment: 'node'` (Phase 12 confirmed) — for any new component-level test, use the pure-function pattern from Phase 12's LivePeriodPoller test (no jsdom required) |

---

## Sampling Rate

- **After every task commit:** Run targeted vitest pattern for the touched primitive / surface.
- **After every wave merge:** `npx vitest run` full suite + visual walkthrough of the surfaces touched in this wave.
- **Before `/gsd:verify-work`:** Full vitest suite green (the SDH-03-style no-regression guarantee — every Phase 1–12 test still passes after Phase 13 ships).
- **Max feedback latency:** ~10s (targeted) / ~300s (full).

---

## Per-Task Verification Map

> Test IDs are placeholders. Planner will assign concrete `13-{plan}-{task}` IDs in PLAN.md files and update this map after planning.

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|---|---|---|---|---|---|
| BRAND-01 | `13-CONTEXT.md` exists and is committed (serves as the brand reference until a separate brand kit replaces it) | doc-existence | `test -f .planning/phases/13-ux-brand-pass/13-CONTEXT.md && grep -q "D-121" .planning/phases/13-ux-brand-pass/13-CONTEXT.md` | ✅ already committed | ✅ green |
| BRAND-02 | Tailwind `--primary` semantic token resolves to amber (`oklch` value in the amber range, NOT blue) — D-121 propagation check | unit (CSS-file regex assertion) | `grep -E "^\\s*--primary:\\s*oklch\\([0-9.]+\\s+[0-9.]+\\s+(7[0-9]|80\\.|85)" src/app/globals.css` (amber hue ~75–85°) | ❌ Wave 1 ships | ⬜ pending |
| BRAND-02 | All existing v1/v2/v3.0 vitest tests still pass after Wave 1 token override + font swap | regression | `npx vitest run` exits 0 with all pre-Phase-13 tests green | ✅ baseline known | ⬜ pending per wave |
| BRAND-02 | `next build` exits 0 after each wave (no broken imports, no client-component contract break) | smoke | `npx next build` exit 0 | ✅ baseline known | ⬜ pending per wave |
| BRAND-02 | Phase 12 LivePeriodPoller null-on-disabled contract preserved (`expect(LivePeriodPoller({ enabled: false })).toBeNull()`) | unit | `npx vitest run tests/hakedis-live.test.ts -t "LivePeriodPoller mount gate"` | ✅ exists from Phase 12 | ⬜ pending per wave |
| BRAND-02 | Phase 12 LineSubmissionsPanel 8th column + colSpan math (empty=8, footer=7) preserved | unit + grep | `grep -c "colSpan={8}" src/app/dashboard/\\(admin\\)/hakedis/\\[periodId\\]/page.tsx` ≥1 and `grep -c "colSpan={7}"` ≥1 | ✅ exists from Phase 12 | ⬜ pending per wave |
| BRAND-02 | Phase 11 export bytes for the same finalized period stay identical before/after Phase 13 | regression | `npx vitest run tests/exports.test.ts` exits 0 | ✅ exists from Phase 11 | ⬜ pending per wave |
| BRAND-03 | `src/components/brand/` directory exists with ≥6 of the 7 planned primitives (BrandButton, BrandCard, BrandHeading, BrandEmpty, BrandLogo, BrandBadge, BrandTable) | source-assertion | `ls src/components/brand/ \| wc -l` ≥6; `grep -l "export" src/components/brand/Brand*.tsx \| wc -l` ≥6 | ❌ Wave 1 ships | ⬜ pending |
| BRAND-03 | `BrandButton` exports cva variants (primary / secondary / destructive); rendering each variant in a test does not throw | unit | `npx vitest run src/components/brand/BrandButton.test.tsx` (pure-function call test, vitest node env) | ❌ Wave 1 ships test | ⬜ pending |
| BRAND-03 | `BrandLogo` renders `bayrak` as slate text and `.ai` as amber text — source-assertion via grep on the rendered output | unit | `npx vitest run src/components/brand/BrandLogo.test.tsx` asserts the text content + class strings | ❌ Wave 1 ships test | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### No pixel-level regression tests

Phase 13 does NOT introduce a Playwright / visual-regression suite. Reasons:
- Restyle changes a token slot; behavior tests cover everything downstream.
- A visual-regression baseline costs operator effort (golden-image curation) for marginal added catch.
- The phase has explicit Manual UAT rows below for the human-eye half of "did this surface get re-skinned correctly."

If the user wants pixel regression later, that's its own v3.1+ phase.

---

## Wave 0 Requirements

Phase 13 has **no Wave 0** in the traditional sense — vitest 4.1.7 is already installed and configured from Phases 1–12. The "Wave 0 gaps" from RESEARCH.md (npm test script, jsdom setup) are NOT adopted — the existing vitest node-env pattern from Phase 12 covers Phase 13's component tests.

- [x] Vitest 4.1.7 already installed (Phase 1)
- [x] `vitest.config.ts` already configured with `environment: 'node'` (Phase 12 verified)
- [x] `tests/fixtures/db.ts` + `describeIfDb` helper already exists (Phases 1+)
- [ ] **Wave 1 adds (not Wave 0):** `src/components/brand/` directory + 7 primitive files + their pure-function tests via the Phase 12 LivePeriodPoller test pattern

---

## Manual-Only Verifications

Phase 13 is fundamentally a visual exercise. Manual UAT is the primary verification surface; automated tests cover the no-regression guarantee.

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| Wave 1 brand spine — sidebar wordmark + token propagation visible | BRAND-01 / BRAND-02 / D-121 / D-124 | Visual identity check requires human eyes | After Wave 1 merge: open any dashboard route; sidebar must show `bayrak` (slate-900) + `.ai` (amber-500) Geist Sans 600 wordmark; primary buttons across the app must render amber-500 (not blue) without per-component edits |
| Wave 2 hakkediş + exports re-skin matches brand language | BRAND-02 / D-125 / D-128 | Side-by-side aesthetic check | After Wave 2 merge: open `/dashboard/hakedis/{any-period}` and `/dashboard/exports`; compare against Procore + Autodesk Construction Cloud screenshots (cite D-128); confirm slate + amber + compact + flat reads correctly on data-heavy tables |
| Wave 3 analytics + people re-skin holds the language | BRAND-02 | Same | After Wave 3 merge: open overview + scorecards + leaderboard + per-person profile; KPI tiles use BrandKpiTile compact density; charts inherit token colors |
| Wave 4 projects + auth + 404/error/loading | BRAND-02 | Same — also covers the "I forgot this existed" surfaces | After Wave 4 merge: visit projects list, project detail, BOQ table, sign-in page; force a 404 (e.g. `/dashboard/nope`); force an error (e.g. break a DB env var temporarily); confirm 404 + error pages use brand language |
| TR ↔ EN locale toggle preserves brand on every surface | BRAND-02 / D-123 | Locale-switching can break a custom-styled component if it doesn't use next-intl correctly | After each wave: toggle locale on at least 3 surfaces touched in the wave; confirm no fallback strings, no broken layout |
| LivePeriodPoller polling indicator is visible (sr-only when enabled) | BRAND-02 / D-120 carryover | Polling indicator is screen-reader-only; visual UAT confirms only the panel UI changes are styled, the sr-only contract isn't broken | After Wave 2: open a draft hakkediş detail in a screen reader (VoiceOver / NVDA); confirm "polling indicator" string is announced periodically; visually confirm no visible polling element appears (the sr-only span stays sr-only) |
| Functional regression spot-check on the audit→hakkediş loop | BRAND-02 | The end-to-end loop is the highest-stakes flow Phase 13 must NOT break | After each wave: have an auditor approve a Telegram submission for a project with an open draft period; within 30s the draft period detail page (re-skinned in Wave 2) updates the period_qty without manual refresh — same SDH-01 behavior Phase 12 shipped |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (none for Phase 13 — vitest exists)
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s (quick) / 300s (full)
- [ ] `nyquist_compliant: true` set in frontmatter (after planner + plan-checker pass)

**Approval:** pending (planner to update on completion)
