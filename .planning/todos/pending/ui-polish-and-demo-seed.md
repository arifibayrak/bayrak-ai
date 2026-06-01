---
title: UI polish batch — remaining (stat grid + analytics empty state)
status: pending
priority: medium
created: 2026-06-01
updated: 2026-06-01
area: ui
origin: user feedback while reviewing Field-Industrial foundation
---

# UI polish — remaining items

From the 2026-06-01 browser review. DONE so far: hakkediş crash fix (commit 99727d3), logo dedup + graphite legibility (0679cfd), test-data cleanup + demo-month seed (81ce079). Remaining:

## 2. Stat cards → responsive wrapping grid
- On `/dashboard/overview` the KPI stat cards (Bekleyen Denetim, Onaylar, Retler, Aktif İşçiler, Para…) sit in a single horizontal row that OVERFLOWS / gets cut off at the right edge. Make them a responsive grid that wraps by viewport width (e.g. `grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3`), not one fixed overflowing row.
- Find the stat-card row in the overview page/components (`src/app/dashboard/(admin)/overview/…` or a StatCards/KpiRow component). The charts below ("İş Hacmi", "Kazanılan Değer", "Red Oranı") may have the same horizontal-overflow issue — check those too.

## 3. Analytics ("Analizler") coming-soon page-fit
- The Analizler page shows a small "Yakında / Bu bölüm yapım aşamasındadır ve ileride hazır olacaktır." note. Make it a proper FULL-PAGE-FIT empty state matching the Personnel and Projeler page layout/scale (same page container, heading rhythm, centered BrandEmpty filling the content area) — larger and more intentional, not a tiny note.
- Likely `src/app/dashboard/(admin)/analytics/…/page.tsx` + `BrandEmpty`.

## Notes
- Increment 2+ of the Field-Industrial UI/brand pass. Per-screen polish.
- Dev DB now has a real demo month (2 projects, 5 people, 30 submissions, 1 hakkediş period) — so the overview KPIs/charts now render with data; tune density against real numbers.
- Run `npm run dev` (non-Turbopack) + eyeball after each. Keep tsc/build/tests green. NOTE: trust only a clean single `npx vitest run` for test status (see memory: executor test claims are unreliable here).
