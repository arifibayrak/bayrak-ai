---
title: UI polish batch — remaining (stat grid + analytics empty state)
status: completed
priority: medium
created: 2026-06-01
updated: 2026-06-01
completed: 2026-06-01
area: ui
origin: user feedback while reviewing Field-Industrial foundation
---

# UI polish — remaining items

From the 2026-06-01 browser review. DONE so far: hakkediş crash fix (commit 99727d3), logo dedup + graphite legibility (0679cfd), test-data cleanup + demo-month seed (81ce079).

## RESOLVED 2026-06-01 (increment 2)
- **Post-seed photo crash (root cause found):** seed wrote `https://blob.vercel-storage.com/demo/...`, a host NOT in `next.config` `images.remotePatterns` (real bot photos use `*.public.blob.vercel-storage.com`). `next/image` throws a render-time error on an unconfigured host → caught by `app/error.tsx` ("Bir şeyler ters gitti"). SSR returned 200, so there was no server `⨯`. Crashed every photo surface: record detail, project Kayıtlar tab, map popup. Fixed by pointing seed at local `/demo/field-photo.png` (committed on-brand placeholder; relative paths bypass remotePatterns). Re-seeded dev DB. (commit 20c5586)
- **Stat grid (#2):** KPI grid → `grid-cols-2 md:grid-cols-3 2xl:grid-cols-5 gap-4`; 5th card no longer clips against its corner alert badge. Charts row was already fine. (c28a255)
- **Filter selects bonus bug:** base-ui Select trigger showed raw value (`__all__` / project UUID); fixed via Root `items` map. (676ed11)
- **Analytics empty state (#3):** full-page-fit centered `BrandEmpty` (BarChart2 icon + Yakında badge); office-engineers table still renders when engineers exist. (dd4db69)
- Gate green: tsc 0, vitest 416 pass / 2 skip, build OK.

---
Original items (now done):

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
