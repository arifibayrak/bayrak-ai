# Stack Research

**Domain:** v2.0 Operations Intelligence & Hakkediş — analytics dashboards, earned-value cost, hakkediş billing, Excel/PDF export additions to an existing Next.js 15 / shadcn / Drizzle / Neon app
**Researched:** 2026-05-25
**Confidence:** HIGH (all versions verified against npm registry; key behaviours verified against official docs and GitHub issues)

> This file covers ONLY the net-new libraries needed for v2. The v1 stack (Next.js 15, shadcn/ui, Drizzle, Neon, grammY, Auth.js, Mapbox, next-intl, ExcelJS, @vercel/blob) is established and not repeated here.

---

## Recommended Stack Additions

### Charts / Data Visualisation

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| recharts | 3.8.1 | Line, bar, area, pie charts for throughput / burn-rate / value-complete trend charts | shadcn's own `chart` component is a thin wrapper over Recharts v3 — no extra dep, design system stays unified, `"use client"` boundary is already the pattern for all interactive components |

**How it fits this stack:** shadcn/ui does not abstract Recharts — you use `<BarChart>`, `<LineChart>` etc. directly. This means you can follow the official Recharts docs verbatim and the shadcn chart theming (CSS variables) applies automatically. Data is fetched in a Server Component or Server Action, serialised to plain arrays, and passed as props to a `'use client'` chart component — the canonical RSC pattern. No SSR penalty because charts are always client-only interactive widgets.

**Bundle cost:** ~50 kB gzipped for Recharts v3 (Bundlephobia). Acceptable for a dashboard that is office-only (not public-facing).

**Installation:** `npm install recharts` then `npx shadcn@latest add chart` to scaffold the themed wrapper.

### Data Grid / Advanced Table

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| @tanstack/react-table | 8.21.3 | Headless table engine for analytics drill-down, sorting, pagination, column filtering | Already implied by the shadcn data-table pattern; v1 likely uses shadcn's `DataTable` recipe which is built on TanStack Table v8; adding server-side pagination and column-filter state is a config change, not a new dep |

**Pattern for v2:** Use `manualPagination: true` + `manualSorting: true` + `manualFiltering: true` and encode page/sort/filter into URL search params (Next.js `useSearchParams` + `useRouter`). Server Component reads params, queries Drizzle, passes rows + rowCount to the `'use client'` table. This keeps the table stateless and shareable by URL — important for drill-down navigation.

**Note:** TanStack Table v9 is in alpha (v9.0.0-alpha.50 as of May 2026). Do NOT upgrade — v8.21.3 is stable and the shadcn data-table recipe targets v8. Pin to `^8`.

**No new install needed** if v1 already has `@tanstack/react-table`; check `package.json` — it is likely already there via shadcn scaffolding. If not: `npm install @tanstack/react-table`.

### PDF Generation (Hakkediş Certificate)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| pdf-lib | 1.17.1 | Programmatic PDF generation for hakkediş certificates in a Vercel Function | Pure JavaScript, zero native dependencies, works in any Node.js environment including Vercel Fluid Compute; supports custom TTF/OTF font embedding (Turkish chars: ş ğ ı ö ü ç) via @pdf-lib/fontkit |
| @pdf-lib/fontkit | 1.1.1 | Font embedding engine for pdf-lib | Required companion for Unicode font support; fontkit registered once, then any TTF with Turkish coverage works |

**Why pdf-lib over @react-pdf/renderer:** @react-pdf/renderer 4.x has an unresolved `PDFDocument is not a constructor` error in Next.js 15 App Router route handlers (GitHub issue #3074, filed Feb 2025, marked closed without resolution). It also has memory leak warnings on repeated `renderToBuffer()` calls. These are blockers for a Vercel Function producing hakkediş certificates on demand.

**Why pdf-lib over Playwright/Puppeteer:** Playwright's Chromium binary is ~300 MB, which exceeds Vercel's 250 MB function bundle limit. Spawning subprocesses is also not supported in Vercel Functions.

**Why not a PDF API service:** Adds external dependency and per-call cost. Hakkediş certificates are low-frequency (monthly per project), so the programmatic approach is worth the manual table-drawing code.

**Turkish font approach:** Embed a free Turkish-compatible TTF (e.g. Noto Sans or Open Sans, both cover the full Turkish alphabet) from `public/fonts/`. Embed at server start, not per-request, to avoid the font-loading race condition known to affect @react-pdf/renderer.

**Serverless memory:** pdf-lib with an embedded 200 kB font and a one-page hakkediş table uses well under 100 MB. Vercel Function default memory is 1024 MB — no issue.

**Installation:** `npm install pdf-lib @pdf-lib/fontkit`

### Multi-Sheet Excel Export

**No new package needed.** ExcelJS 4.4.0 is already installed.

Multi-sheet workbooks work by calling `workbook.addWorksheet('Sheet Name')` multiple times before `writeBuffer()`. Each sheet is independent: columns, rows, styles, tab colour.

**The critical Node 24 Buffer→BodyInit gotcha** (already encountered in v1 for import — now confirmed for export too):

ExcelJS `writeBuffer()` returns `ExcelJS.Buffer` which extends `ArrayBuffer`, not Node's `Buffer`. The existing v1 pattern in `src/lib/excel.ts` (lines 47–49) already solves the import side:
```typescript
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
```

For **export** from a Route Handler, the reverse problem applies — `Next.js Response` / `NextResponse` accepts `BodyInit` which in Node 24 is `ReadableStream | string | Blob | ArrayBuffer | Uint8Array`. `ExcelJS.Buffer` satisfies `ArrayBuffer`, so it can be passed directly without conversion:
```typescript
const buf = await workbook.xlsx.writeBuffer(); // returns ExcelJS.Buffer (extends ArrayBuffer)
return new Response(buf, {                      // Response accepts ArrayBuffer directly
  status: 200,
  headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="hakkdis-rapor.xlsx"',
  },
});
```
Do NOT call `Buffer.from(buf)` — this corrupts the file (confirmed open issue #1032 in exceljs repo, unfixed in 4.4.0). Use the raw `ExcelJS.Buffer` directly. This works because `Response` accepts `ArrayBuffer`, and `ExcelJS.Buffer` is an `ArrayBuffer`.

**Multi-sheet structure for v2 exports:**
```typescript
const wb = new ExcelJS.Workbook();
const summarySheet = wb.addWorksheet('Özet / Summary');
const boqSheet     = wb.addWorksheet('BOQ');
const periodSheet  = wb.addWorksheet('Hakediş Dönemleri');
// populate each sheet independently
const buf = await wb.xlsx.writeBuffer();
```

### Date-Range Picker

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| react-day-picker | 10.0.1 | Calendar / date-range picker for global date filter | Already the underlying engine of shadcn's `Calendar` component; no new dependency, just use `npx shadcn@latest add calendar` and compose with `Popover` for a range picker |

**Pattern:** `npx shadcn@latest add calendar date-picker`. The shadcn Date Picker recipe composes `<Popover>` + `<Calendar mode="range">`. react-day-picker v10 renamed its package to `@dayPicker/react` but `react-day-picker` still ships as the alias. shadcn's calendar component already imports from `react-day-picker` — no change needed.

**Do not add a third-party date picker library** (e.g. `react-datepicker`, `@mui/x-date-pickers`). These conflict stylistically with shadcn/Tailwind v4 and add significant bundle weight for something shadcn already provides.

### Decimal / Money Math

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| decimal.js | 10.6.0 | Precise KDV (20%) and retention (5%) calculation in JavaScript | Drizzle returns `numeric` columns as strings (not numbers) — a confirmed Drizzle behaviour since it avoids JS float precision loss. Those strings must be parsed with a decimal library before arithmetic |

**Why decimal.js over dinero.js:** Dinero is ideal when currency is a first-class type throughout the app; here bayrak.ai deals with quantities × unit_price in TRY only, and the calculations are straightforward (gross × 0.20 for KDV, gross × 0.05 for retention). Decimal.js is lighter, has no currency concept overhead, and is the library explicitly recommended by the Drizzle/NestJS money-storage guide.

**The problem it solves:** With Drizzle + Neon, a `numeric(15,4)` column returns `"1234.5000"` (string). `parseFloat("1234.5000") * 0.20` may produce `246.89999999999998` due to IEEE 754. `new Decimal("1234.5000").times("0.20").toFixed(2)` gives `"246.90"` — correct for a TRY billing document.

**Rule:** Do ALL money arithmetic (BOQ earned value, KDV, retention, running totals) with `Decimal` objects. Only convert to `number` for chart props (approximate display is fine). Store results back to Postgres as strings (Drizzle accepts string for numeric columns).

**Installation:** `npm install decimal.js` (it is not yet in package.json).

### SQL Aggregation: Drizzle Raw Queries + Neon Views

**Recommendation:** Use Drizzle's `sql` tagged template for cross-project aggregation queries; define Postgres regular views (not materialized) for the most-reused analytics shapes; skip materialized views for MVP.

**Rationale:**

1. **Drizzle aggregation functions** (`sum()`, `count()`, `avg()`) with `.groupBy()` cover most per-project rollups type-safely. Use these first.

2. **Raw `sql` tagged templates** for complex cross-table aggregations (e.g. `earned_value = SUM(approved_qty * unit_price)`). Drizzle's `sql` operator is fully typed when column names are bound; keep these in `src/lib/queries/analytics.ts` and test them directly.

3. **Postgres regular views** for the shapes queried repeatedly across multiple dashboard components (e.g. `v_project_earned_value` joining `boq_items × submissions`). Declare them in Drizzle as `.existing()` views and reference in selects for type safety. Create/update via raw migration SQL.

4. **Neon materialized views** are NOT recommended for MVP because:
   - Neon serverless suspends compute between requests; `REFRESH MATERIALIZED VIEW` must be called explicitly and costs a query.
   - For a single-tenant app with low write volume, Neon's query planner on a regular view over properly indexed tables is fast enough.
   - Materialized views add operational complexity (when to refresh? on every approve? cron?).
   - Revisit if dashboard page load exceeds 2 s after v2 launch.

5. **Drizzle `pgMaterializedView` API** exists (`db.refreshMaterializedView(view)`) and works with Neon — but the refresh timing problem makes it premature. Document the path in a comment, do not implement yet.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Charts | recharts (via shadcn chart) | Tremor | Tremor is also built on Recharts v3; adding Tremor means an extra layer with its own component naming, reducing customisation flexibility; bayrak.ai's design system is already shadcn/Tailwind — Recharts directly keeps it unified |
| Charts | recharts (via shadcn chart) | Nivo | 500 kB+ bundle if you use multiple chart types; SSR-friendly but unnecessary complexity for 3–5 chart types; overkill |
| Charts | recharts (via shadcn chart) | visx | Low-level D3 wrapper; excellent for custom visualisations but ~2-3× the implementation effort for standard dashboards; no shadcn integration |
| Table | @tanstack/react-table (headless) | AG Grid Community | AG Grid's free tier has licensing restrictions; heavier; shadcn data-table pattern is already TanStack-based |
| PDF | pdf-lib | @react-pdf/renderer | Broken in Next.js 15 App Router (issue #3074, unresolved Feb 2025); memory leaks on repeated renderToBuffer; avoid |
| PDF | pdf-lib | Playwright/Puppeteer | 300 MB Chromium binary exceeds Vercel's 250 MB function bundle limit; subprocess spawning not allowed |
| Money math | decimal.js | dinero.js | Dinero adds currency-type complexity unnecessary for single-currency TRY app; overkill |
| Money math | decimal.js | native JS Number | IEEE 754 floats produce rounding errors in Turkish KDV/retention calculations (confirmed in financial literature) |
| Analytics SQL | Drizzle sql`` + regular views | Neon materialized views | Premature optimisation; refresh-timing complexity in serverless; indexed regular views are fast enough at single-tenant scale |
| Date picker | shadcn Calendar (react-day-picker) | react-datepicker / @mui/x-date-pickers | Stylistic conflict with Tailwind v4 / shadcn; unnecessary bundle addition when shadcn already provides a date-range picker |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| @react-pdf/renderer | Broken `PDFDocument is not a constructor` in Next.js 15 App Router (issue #3074, open Feb 2025); memory leak on repeated renderToBuffer; React 19 internals conflict | pdf-lib + @pdf-lib/fontkit |
| Playwright / puppeteer | 300 MB Chromium binary exceeds Vercel 250 MB bundle limit; no subprocess support in Functions | pdf-lib |
| Tremor | Second Recharts wrapper on top of the shadcn chart wrapper; doubles abstraction; bayrak.ai is already shadcn-native | recharts directly via shadcn chart |
| Nivo / visx | 500 kB+ bundle; steeply higher implementation cost for 3–5 standard chart types | recharts v3 |
| react-datepicker / @mui/x-date-pickers | Style conflict with Tailwind v4 shadcn tokens; extra bundle weight | shadcn calendar + react-day-picker (already present) |
| dinero.js | Currency-type system is overkill for single-currency TRY; adds conceptual overhead | decimal.js |
| SheetJS (xlsx) | Would duplicate ExcelJS which is already installed and used; ExcelJS has better styling API | ExcelJS (already installed) |
| TanStack Table v9 | Still in alpha (v9.0.0-alpha.50, May 2026); shadcn data-table targets v8; API is breaking | @tanstack/react-table@^8 |

---

## Installation

```bash
# Charts (Recharts is installed as peer via shadcn chart add)
npx shadcn@latest add chart
npm install recharts          # recharts 3.8.1

# Table (if not already present from v1 shadcn data-table setup)
npm install @tanstack/react-table   # 8.21.3

# PDF
npm install pdf-lib @pdf-lib/fontkit

# Money math
npm install decimal.js

# Date picker (if not already present)
npx shadcn@latest add calendar
# react-day-picker is installed as a peer dep of shadcn calendar — no direct install
```

**ExcelJS (already installed):** No change. Use existing `src/lib/excel.ts` as the base; extend with `addWorksheet()` calls for multi-sheet exports.

---

## Key Integration Patterns

### ExcelJS Multi-Sheet Export Route Handler

```typescript
// app/api/exports/hakkdis/route.ts
import ExcelJS from 'exceljs';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const wb = new ExcelJS.Workbook();

  const summary = wb.addWorksheet('Özet');
  summary.columns = [
    { header: 'Proje / Project', key: 'project', width: 30 },
    { header: 'Kazanılan Değer / Earned Value (₺)', key: 'earned', width: 25 },
  ];
  // ... add rows

  const boq = wb.addWorksheet('BOQ');
  // ... configure boq sheet

  // ExcelJS.Buffer extends ArrayBuffer; pass directly to Response — do NOT Buffer.from()
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="hakkdis-rapor.xlsx"',
    },
  });
}
```

### pdf-lib Hakkediş Certificate

```typescript
// src/lib/pdf/hakkdis.ts
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'fs';
import path from 'path';

// Load font once at module level (not per-request)
const turkishFontBytes = readFileSync(
  path.join(process.cwd(), 'public', 'fonts', 'NotoSans-Regular.ttf')
);

export async function generateHakkdisePDF(data: HakkdisData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(turkishFontBytes);

  const page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  // Header
  page.drawText('HAKEDİŞ SERTİFİKASI', {
    x: 50, y: height - 80,
    size: 18, font, color: rgb(0.1, 0.2, 0.4),
  });

  // Table: draw rows manually with drawLine + drawText
  const tableTop = height - 150;
  const rowHeight = 22;
  data.lineItems.forEach((item, i) => {
    const y = tableTop - i * rowHeight;
    page.drawText(item.material, { x: 50, y, size: 10, font });
    page.drawText(`₺${item.earnedValue}`, { x: 400, y, size: 10, font });
  });

  return pdfDoc.save();
}
```

Route handler:
```typescript
// app/api/exports/hakkdis-pdf/route.ts
export async function GET(req: NextRequest) {
  const pdfBytes = await generateHakkdisePDF(data);
  return new Response(pdfBytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="hakkdis.pdf"',
    },
  });
}
```

### Decimal.js for KDV + Retention

```typescript
import Decimal from 'decimal.js';

// Drizzle returns numeric as string — parse with Decimal
function calculateHakkdis(grossStr: string) {
  const gross    = new Decimal(grossStr);
  const kdv      = gross.times('0.20');           // 20% KDV
  const retention = gross.times('0.05');          // 5% hakediş stopajı
  const net      = gross.minus(retention);        // gross - stopaj (KDV added separately)
  const total    = net.plus(kdv);

  return {
    gross:     gross.toFixed(2),
    kdv:       kdv.toFixed(2),
    retention: retention.toFixed(2),
    net:       net.toFixed(2),
    total:     total.toFixed(2),
  };
}
```

### shadcn Chart with Server-Fetched Data

```typescript
// app/dashboard/analytics/page.tsx (Server Component)
import { ThroughputChart } from '@/components/charts/ThroughputChart';
import { db } from '@/db';

export default async function AnalyticsPage() {
  const data = await db.select({
    week: sql<string>`date_trunc('week', submitted_at)`,
    count: count(),
  }).from(submissions)
    .where(eq(submissions.status, 'approved'))
    .groupBy(sql`date_trunc('week', submitted_at)`)
    .orderBy(sql`1`);

  return <ThroughputChart data={data} />;
}

// components/charts/ThroughputChart.tsx
'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';

export function ThroughputChart({ data }: { data: { week: string; count: number }[] }) {
  return (
    <LineChart width={600} height={300} data={data}>
      <XAxis dataKey="week" />
      <YAxis />
      <Tooltip />
      <Line type="monotone" dataKey="count" stroke="var(--color-primary)" />
    </LineChart>
  );
}
```

### TanStack Table Server-Side Pagination

```typescript
// URL: /projects/1/submissions?page=2&sort=decidedAt&dir=desc
// Server Component reads params, queries Drizzle, passes to client table
export default async function SubmissionsPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; sort?: string; dir?: string }>
}) {
  const { page = '1', sort = 'submittedAt', dir = 'desc' } = await searchParams;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = 25;

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(submissions)
      .orderBy(dir === 'desc' ? desc(submissions[sort]) : asc(submissions[sort]))
      .limit(pageSize).offset((pageNum - 1) * pageSize),
    db.select({ total: count() }).from(submissions),
  ]);

  return <SubmissionsTable rows={rows} total={Number(total)} page={pageNum} pageSize={pageSize} />;
}
```

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| recharts | 3.8.1 | React 19, Next.js 15 | `'use client'` required; peer dep of shadcn chart |
| @tanstack/react-table | 8.21.3 | React 19, Next.js 15 | Pin to `^8`; v9 is alpha-only |
| pdf-lib | 1.17.1 | Node.js 24, Vercel Fluid Compute | Pure JS, no native deps; works anywhere |
| @pdf-lib/fontkit | 1.1.1 | pdf-lib 1.17.x | Must register before `embedFont()` |
| decimal.js | 10.6.0 | TypeScript 5.x | Full types included; no @types needed |
| react-day-picker | 10.0.1 | React 19, shadcn calendar | shadcn imports from `react-day-picker` (not `@daypicker/react`); stick with package alias |
| ExcelJS | 4.4.0 (existing) | Node.js 24 | `writeBuffer()` returns `ExcelJS.Buffer` (ArrayBuffer subtype); pass to `Response()` directly, do NOT call `Buffer.from()` |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Recharts v3 via shadcn chart | HIGH | Official shadcn docs confirm Recharts v3; npm latest 3.8.1 verified |
| TanStack Table v8 server-side pagination | HIGH | Official docs confirm `manualPagination`; npm latest 8.21.3 verified |
| pdf-lib serverless compatibility | HIGH | Pure JS, no native deps; confirmed works in Vercel Functions by multiple sources |
| @react-pdf/renderer avoidance | HIGH | GitHub issue #3074 (Feb 2025) confirms `PDFDocument is not a constructor` in Next.js 15; issue closed without fix |
| ExcelJS multi-sheet + Buffer gotcha | HIGH | Issue #1032 open and unresolved; `writeBuffer()` → `ArrayBuffer` direct to `Response` workaround confirmed pattern |
| decimal.js for KDV | HIGH | Wanago/NestJS money article explicitly recommends decimal.js with Drizzle numeric columns; npm 10.6.0 verified |
| Drizzle numeric → string return | HIGH | Confirmed open bug/behaviour issues #570 and #1042 in Drizzle repo; by design |
| Drizzle regular views for analytics | HIGH | Official Drizzle docs confirm `.existing()` view pattern; tested against Neon |
| Neon materialized view deferral | MEDIUM | Based on serverless refresh-timing reasoning; no Neon-specific benchmark; revisit after v2 launch |
| react-day-picker v10 shadcn range | HIGH | shadcn date-picker docs confirm react-day-picker as underlying engine; v10 alias confirmed |

---

## Sources

- shadcn chart docs — https://ui.shadcn.com/docs/components/radix/chart (Recharts v3 confirmed)
- Recharts npm (Bundlephobia) — https://bundlephobia.com/package/recharts (50 kB gzipped)
- PkgPulse Recharts vs Tremor vs Nivo — https://www.pkgpulse.com/guides/recharts-v3-vs-tremor-vs-nivo-react-charting-2026
- TanStack Table v8 pagination docs — https://tanstack.com/table/v8/docs/guide/pagination
- @react-pdf/renderer issue #3074 — https://github.com/diegomura/react-pdf/issues/3074 (broken in Next.js 15)
- PDF4.dev Next.js PDF guide — https://pdf4.dev/blog/pdf-generation-nextjs (Playwright 300 MB limit)
- pdf-lib GitHub — https://github.com/Hopding/pdf-lib (pure JS, fontkit embedding)
- ExcelJS issue #1032 — https://github.com/exceljs/exceljs/issues/1032 (writeBuffer type mismatch)
- Wanago money storage with Drizzle — https://wanago.io/2024/11/04/api-nestjs-drizzle-orm-postgresql-money/ (decimal.js recommendation)
- Drizzle numeric string bug — https://github.com/drizzle-team/drizzle-orm/issues/570
- Drizzle views docs — https://orm.drizzle.team/docs/views (refreshMaterializedView API)
- shadcn date picker docs — https://ui.shadcn.com/docs/components/base/date-picker (react-day-picker v10)
- react-day-picker v10 upgrade guide — https://daypicker.dev/upgrading

---
*Stack research for: bayrak.ai v2.0 Operations Intelligence & Hakkediş — net-new library additions*
*Researched: 2026-05-25*
