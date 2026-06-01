---
title: UI polish batch + fictional-month demo seed (from user browser review 2026-06-01)
status: pending
priority: high
created: 2026-06-01
area: ui, data, dx
origin: user feedback while reviewing Field-Industrial foundation (increment 1) in browser
---

# UI polish batch + demo data seed

User reviewed the Field-Industrial UI foundation live and gave this batch. The hakkediş crash (item 5) was **already fixed** this session (commit 99727d3 — `asHakedisStatus` moved to server-safe `src/lib/hakedis-status.ts`). The rest below remain.

## 1. Logo duplication + faded sidebar logo
- `bayrak.ai` wordmark appears in BOTH the graphite sidebar (top-left) AND the main top bar (`src/components/layout/TopNav.tsx`) — repetitive. Keep it in ONE place (recommend: keep in sidebar as the brand anchor, remove from TopNav — or replace TopNav wordmark with page title/breadcrumb).
- Sidebar logo reads faded/low-contrast on the new graphite panel ("bayrak" nearly invisible, ".ai" amber). Fix `BrandLogo` so the wordmark is legible on graphite (light steel text + amber ".ai"), or give the sidebar a dedicated logo lockup. Consider a small mark/glyph.
- Files: `src/components/brand/BrandLogo.tsx`, `src/components/admin/AppSidebar.tsx`, `src/components/layout/TopNav.tsx`.

## 2. Stat cards → responsive wrapping grid
- On `/dashboard/overview` the KPI stat cards (Bekleyen Denetim, Onaylar, Retler, Aktif İşçiler, Para…) sit in a single horizontal row that OVERFLOWS / gets cut off at the right edge. Make them a responsive grid that wraps to multiple rows by viewport width (e.g. `grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3`), not one fixed overflowing row.
- Find the stat-card row in the overview page/components (`src/app/dashboard/(admin)/overview/…` or a StatCards/KpiRow component).

## 3. Analytics ("Analizler") coming-soon page-fit
- The Analizler page shows a small "Yakında / Bu bölüm yapım aşamasındadır ve ileride hazır olacaktır." placeholder. Make it a proper FULL-PAGE-FIT empty state that matches the Personnel and Projeler page layout/scale (same page container, heading rhythm, centered BrandEmpty filling the content area) — and make it visually larger/more intentional, not a tiny note.
- Likely `src/app/dashboard/(admin)/analytics/…/page.tsx` + `BrandEmpty`.

## 4. Clean test/seed projects  (do together with item 5)
- Projeler list is full of duplicate junk "Test Project" rows (seed leftovers). Remove them. Best done as the RESET step of the demo seed (item 5): wipe test projects + their dependents (BOQ items, submissions, hakkediş) FK-safely, then insert realistic data.

## 5. Seed a fictional month of realistic demo data  (HIGH leverage — makes the whole dashboard meaningful)
- Build a seed script (e.g. `scripts/seed-demo-month.ts`, run via `tsx`, guarded to the default tenant + a clearly-named demo project so it never hits real prod data) that creates a believable ~1-month dataset for the office-engineer dashboard:
  - A few **personas/workers** (field workers + an on-site auditor) with TR names, telegram IDs, person↔project assignments.
  - 1–2 realistic **projects** (e.g. a pipeline/utility route) with a **BOQ** (several items: excavation, pipe-laying, backfill, etc. with quantities + unit prices + currency).
  - A **route** with geometry so the map + chainage have something (or reuse an existing DXF import path).
  - ~20–40 **submissions** spread across the month (photo URL, qty, location, notes, chainage), with a realistic mix of **approved / rejected / pending_audit** and decided_by/decided_at timestamps — so KPIs (Bekleyen Denetim, Onaylar, Retler, İş Hacmi, Kazanılan Değer, Red Oranı) all show real numbers instead of 0 / "Veri yok".
  - A **hakkediş period** for the month with deductions, so the hakkediş list + detail render with data.
  - Drive approved_qty / earned-value so charts populate.
- Apply FK-safe (default-tenant guard pattern, mirror migration 0015). Run via the same DB-access path as migrations.
- After seeding, the overview charts ("İş Hacmi", "Kazanılan Değer", "Red Oranı") should no longer be empty.

## Notes
- This is increment 2+ of the Field-Industrial UI/brand pass. Items 1–4 are per-screen polish; item 5 is demo data.
- Run `npm run dev` (non-Turbopack) + eyeball after each. Keep tsc/build/tests green.
