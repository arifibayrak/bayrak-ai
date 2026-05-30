---
phase: 15
slug: chainage-as-built-view-approval-snapshot
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-30
---

# Phase 15 — Validation Strategy

> Per-phase validation contract. Derived from 15-RESEARCH.md "## Validation Architecture" + "## Security Domain".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing; `vitest.config.ts`, DB-test timeouts raised in Phase 14) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/chainage.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | quick: pure-unit < 5s; integration (DB) within raised hook timeouts |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/chainage.test.ts`
- **After every plan wave:** `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite green
- **Max feedback latency:** ~5s quick

---

## Per-Requirement Verification Map

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| CHN-01 | `formatChainage(2347)` = "km 2+347"; 0/1000/12480 cases | unit | `npx vitest run tests/chainage.test.ts -t "formatChainage"` | ❌ W0 | ⬜ |
| CHN-02 | `setChainageOffset` writes `routes.chainage_offset_m`; buckets apply offset | integration | `npx vitest run tests/chainage.test.ts -t "chainage offset"` | ❌ W0 | ⬜ |
| CHN-03 | After approval, `submissions.chainage_m` non-NULL = ROUND(frac×len,2); `route_geometry_version` matches route | integration | `npx vitest run tests/chainage.test.ts -t "chainage snapshot"` | ❌ W0 | ⬜ |
| CHN-03 | Backfill migration 0013: `COUNT(*) approved AND chainage_m IS NULL AND segment_fraction NOT NULL` = 0 | manual SQL | post-migrate SQL check | — | ⬜ |
| CHN-04 | `getChainageBuckets` enumerates ALL buckets (generate_series); correct start/end | unit/integration | `npx vitest run tests/chainage.test.ts -t "getChainageBuckets"` | ❌ W0 | ⬜ |
| CHN-04 | D-04 three-state: ≥1 approved→approved; 0 approved+≥1 pending→in_progress; none→not_started | unit | `npx vitest run tests/chainage.test.ts -t "bucket status"` | ❌ W0 | ⬜ |
| CHN-06 | Completion % = covered buckets ÷ total buckets ×100 | unit | `npx vitest run tests/chainage.test.ts -t "completion"` | ❌ W0 | ⬜ |
| CHN-06 | Over-completion clamp: 2 approved in km 0–1 on a 1km route → 100% (not 200%) | unit | `npx vitest run tests/chainage.test.ts -t "completion clamp"` | ❌ W0 | ⬜ |
| CHN-07 | `GET /api/exports/chainage?format=xlsx` → 200 + correct Content-Type; auth() → 401 on no session | integration/manual | manual + route inspection | — | ⬜ |
| CHN-07 | Excel sheet has 8 columns in order (Km Başlangıç, Km Bitiş, İş Adedi, Malzeme, Miktar, Birim, İşçi, Denetçi) | unit (ExcelJS parse) | `npx vitest run tests/chainage.test.ts -t "chainage excel columns"` | ❌ W0 | ⬜ |
| CHN-05 | As-built row → canonical submission detail; back-link returns to strip (from=asbuilt) | manual | UI smoke | — | ⬜ |
| Pitfall 2 | Bucket boundary: exactly 1000.0 m → bucket index 1 (not 0) | unit | `npx vitest run tests/chainage.test.ts -t "bucket boundary"` | ❌ W0 | ⬜ |
| Pitfall 13 | Calibration consistency: same `chainage_m + offset` in dashboard bucketStart AND Excel first column AND Telegram approval line | integration/manual | manual spot-check across 3 surfaces | — | ⬜ |
| Folded todo | Google Maps link uses ST_Y=lat, ST_X=lon (no axis swap); link renders on SubmissionDetailView | unit/manual | `npx vitest run tests/chainage.test.ts -t "maps link"` + UI | partial | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/chainage.test.ts` — CHN-01 (formatChainage), CHN-03 (snapshot integration), CHN-04 (bucket aggregation + three-state), CHN-06 (completion + clamp), Pitfall 2 (boundary), CHN-02 (offset), CHN-07 (Excel columns)
- [ ] Fixture: seed a route with `total_length_m = 3000` + 3 approved submissions at `segment_fraction` 0.166/0.5/0.833; verify bucket output
- [ ] No new framework install (vitest configured)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| As-built strip renders + drill-down + back-link | CHN-04/05 | Browser render + navigation | Open As-Built tab; verify colour bar + table; click a row → submission detail; back-link returns |
| Telegram approval shows calibrated chainage | CHN-02/Pitfall 13 | Live bot flow | Approve a submission; confirm the chainage line matches the dashboard (with offset) |
| Excel/PDF export downloads + auth gate | CHN-07 | Live route handler + binary | Trigger export; confirm 8-col Excel + PDF; confirm 401 when signed out |
| Backfill no-op flag | CHN-03 | Live DB | After migration 0013, run the COUNT SQL; flag if non-zero |
| Calibration consistency across 3 surfaces | Pitfall 13 | Cross-surface visual | Set an offset; confirm same value in strip + Excel + Telegram |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`tests/chainage.test.ts` + fixture)
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s (quick)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
