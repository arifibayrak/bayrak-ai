# Phase 11: Exports — Research

**Researched:** 2026-05-28
**Domain:** Excel export (ExcelJS), PDF generation (@react-pdf/renderer), binary Next.js App Router route handlers
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-105:** `@react-pdf/renderer` is the PDF library. Pure-Node generation; no Chromium. Render JSX with flex layouts, embed TTF via `Font.register`, stream to route handler response.
- **D-106 [Claude's Discretion]:** DejaVu Sans recommended as embedded TTF (full Latin Extended-A, Turkish-safe). Planner may swap to project UI font if already bundled as TTF accessible to react-pdf.
- **D-107:** PDF generated on-demand per download click. Reads ONLY snapshot fields from `getPeriodDetail`. No Vercel Blob storage. No eager generation at finalize.
- **D-108:** Distributed + hub UX. Three trigger surfaces: `/dashboard/(admin)/exports` hub, `PeriodDetailControls`, and the same route handlers serve both. No duplication of generation logic.
- **D-109:** Every successful export logs an `office_activity_log` row. Four new `OFFICE_ACTION_TYPES`: `hakedis_pdf_exported`, `hakedis_excel_exported`, `submission_ledger_exported`, `performance_summary_exported`.
- **D-110:** Performance summary = workers tab + auditors tab. Office engineers excluded.
- **D-111:** Bilingual column headers = joined "TR / EN" single header row per sheet.
- **D-112:** Verbose filenames: `submission-ledger-{projectSlug}-{fromDate}-{toDate}.xlsx`, `hakkedis-{periodNumber}-{projectSlug}.xlsx`, `performance-{projectSlug}-{fromDate}-{toDate}.xlsx`, `hakkedis-{periodNumber}-{projectSlug}-{YYYYMMDD}.pdf`.
- **D-113:** ExcelJS is the Excel library (already in stack; same as BOQ import). `workbook.xlsx.writeBuffer()` → Uint8Array response.
- **D-114:** All export route handlers under `src/app/api/exports/.../route.ts`. First statement: `const session = await auth()`. On no session → HTTP 401 via NextResponse (NOT redirect). Set `Content-Type` and `Content-Disposition`.
- **D-115:** BOQ/hakkediş Excel = three sheets: Yeşil Defter, Fiyat İcmali, Hesap Özeti.
- **D-116:** Money values in Excel cells use cell `numFmt` — NEVER `parseFloat()` in route handler. Postgres decimal string → Excel cell with format applied.

### Claude's Discretion
- D-106 font choice (DejaVu Sans vs project UI font, if TTF accessible)
- ExcelJS streaming buffer size + flush cadence; freeze-pane behavior; exact column ordering per sheet
- `/dashboard/(admin)/exports` page layout (KpiCard-style vs button list) — decided in `/gsd:ui-phase 11`, which is already approved: three trigger-card sections
- Error-state UX for draft period export attempt
- Period picker status filter (only non-draft periods)
- PDF metadata: Title, Author, CreationDate

### Deferred Ideas (OUT OF SCOPE)
- Email/queue delivery of exports
- Excel template branding (logo, watermark)
- Cross-language export variants (single-click both `*.tr.xlsx` + `*.en.xlsx`)
- Eager PDF storage in Vercel Blob
- Office-engineer performance summary
- Per-period richer download analytics
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXP-01 | Admin can export a submissions ledger to Excel using the canonical record shape, respecting active filters | `getCanonicalSubmissions()` returns `CanonicalSubmission[]` — maps directly to rows. Existing `generateBoqTemplate()` pattern in `src/lib/excel.ts` is the code template. |
| EXP-02 | Admin can export BOQ/hakkediş progress to Excel in bilingual TR/EN yeşil-defter format | `getPeriodDetail(periodId)` returns `{period, lines, deductions}` already computed. Three-sheet workbook: Yeşil Defter, Fiyat İcmali, Hesap Özeti. |
| EXP-03 | Admin can export worker and auditor performance summaries to Excel | `getPortfolioPeople({role: 'worker'})` → `PortfolioWorker[]`; `getPortfolioPeople({role: 'auditor'})` → `PortfolioAuditor[]`. Two-tab workbook. |
| EXP-04 | Office engineer can export a finalized hakkediş certificate as a PDF with correct Turkish character rendering | `@react-pdf/renderer` 4.5.1 with DejaVu Sans TTF. `getPeriodDetail(periodId)` is the data source. Snapshot fields only (D-107). |
</phase_requirements>

---

## Summary

Phase 11 delivers four downloadable artefacts from four route handlers, two trigger surfaces, and extends the activity log with four new action types. The data layer is already fully built — `getCanonicalSubmissions`, `getPortfolioPeople`, and `getPeriodDetail` cover all four artefacts without any new SQL. The project already has an in-production Excel download route handler (`src/app/dashboard/projects/[id]/boq-template/route.ts`) that demonstrates the exact binary response pattern: `auth()` guard, `ExcelJS.Workbook.xlsx.writeBuffer()`, `new NextResponse(new Uint8Array(buffer), { headers: {...} })`. Phase 11 follows this pattern for all four route handlers.

The key risk area is `@react-pdf/renderer` compatibility with Next.js 15. Research confirmed that the library is on Next.js's official automatic `serverExternalPackages` opt-out list (confirmed in Next.js docs, version 15.0.0+), meaning it loads as native Node.js modules without bundling — this is the primary mechanism that resolves the "PDFDocument is not a constructor" error documented in issue #3074. The project's `next.config.ts` does not yet explicitly list `@react-pdf/renderer`, but since it's auto-externalized, this is not a blocker. Inter (the project's UI font) is loaded by `next/font/google` as WOFF2 only — WOFF2 is NOT reliably supported by `@react-pdf/renderer` (official docs state TTF and WOFF only). DejaVu Sans via the `dejavu-fonts-ttf` npm package (2.37.3, MIT-adjacent license) is the correct choice for D-106.

The Exports hub period picker requires a new `getAllPeriodsForTenant` query (tenant-scoped, non-draft only, joins project name) because `getPeriodsByProject` only queries one project at a time. The project schema has no `slug` column on `projects` — D-112 filenames require deriving a slug from the project name at route-handler time (e.g., `name.toLowerCase().replace(/[^a-z0-9]+/g, '-')`).

**Primary recommendation:** Follow the `boq-template/route.ts` precedent for all four route handlers. Install `@react-pdf/renderer@4.5.1` + `dejavu-fonts-ttf@2.37.3`. Place DejaVu Sans TTF at `public/fonts/DejaVuSans.ttf`. Use `Font.register` with `path.join(process.cwd(), 'public/fonts/DejaVuSans.ttf')` for server-side PDF generation. Use in-memory `ExcelJS.Workbook` + `xlsx.writeBuffer()` for all Excel handlers (same as existing `generateBoqTemplate`).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Excel file generation | API / Backend (route handler) | — | ExcelJS is Node-only; binary response cannot come from RSC or Server Action |
| PDF file generation | API / Backend (route handler) | — | @react-pdf/renderer renderToBuffer is Node-only; must be a route handler |
| Auth guard for exports | API / Backend (route handler) | — | Route handlers do NOT inherit layout auth; explicit `auth()` first statement (D-114, SC5) |
| Trigger UI (hub page) | Frontend Server (RSC page) | Browser (client filterbar) | Hub page is a server component; FilterBar uses useSearchParams (CSR bailout → Suspense) |
| Period picker data | Frontend Server (RSC page) | — | Fetch non-draft periods at render time via server-side query in page.tsx |
| Activity logging | API / Backend (route handler) | — | `logOfficeActivity` uses `after()` from `next/server` — must be called in a route handler or server action request scope |
| Bilingual headers in Excel | API / Backend (route handler) | — | Hardcoded TR/EN strings in the Excel builder lib function, no runtime i18n needed |
| i18n UI labels | Frontend Server (RSC page) | Browser (client components) | next-intl `getTranslations()` on server; `useTranslations()` on client |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ExcelJS | 4.4.0 | Excel workbook generation | Already in CLAUDE.md stack; already used for BOQ import + template in Phase 1; existing `src/lib/excel.ts` pattern is the direct precedent [VERIFIED: npm registry] |
| @react-pdf/renderer | 4.5.1 | PDF generation with React JSX | D-105 locked; auto-externalized by Next.js 15; React 19 supported since v4.1.0; MIT license; 164 published versions [VERIFIED: npm registry] |
| dejavu-fonts-ttf | 2.37.3 | DejaVu Sans TTF for PDF Turkish glyph rendering | Full Latin Extended-A (Turkish ğ ş ı ö ü ç Ç Ş Ğ İ); TTF format required by react-pdf; npm package delivers the TTF files directly [VERIFIED: npm registry] |

### Supporting (already installed — no new installs)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next-intl | 4.12.x | UI label translations on hub page | `getTranslations('dashboard.admin.exports')` in page.tsx RSC |
| decimal.js | in stack | Money display on hub page | `formatMoney`/`formatMoneyAmount` for period picker Net Ödeme column |
| lucide-react | in stack | FileSpreadsheet, FileText, Loader2, FileX, Download icons | UI-SPEC icons for hub page and controls |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @react-pdf/renderer | pdf-lib + @pdf-lib/fontkit | pdf-lib is purely low-level (no JSX layout); more verbose; D-105 locked @react-pdf/renderer |
| dejavu-fonts-ttf | Noto Sans (via fontsource) | Noto Sans also has full Turkish coverage; slightly larger; DejaVu is lighter and well-tested in financial PDF contexts |
| dejavu-fonts-ttf | Inter TTF from google-fonts | Inter is loaded as WOFF2 by next/font — react-pdf officially supports TTF and WOFF only, not WOFF2 reliably |
| ExcelJS in-memory workbook | ExcelJS.stream.xlsx.WorkbookWriter | StreamingWriter requires converting Node PassThrough to Web ReadableStream; in-memory `writeBuffer()` → `Uint8Array` is simpler and matches existing project pattern |

**Installation:**
```bash
npm install @react-pdf/renderer@4.5.1 dejavu-fonts-ttf@2.37.3
```

**Version verification (run before planning):**
```bash
npm view @react-pdf/renderer version   # → 4.5.1 confirmed
npm view dejavu-fonts-ttf version      # → 2.37.3 confirmed
npm view exceljs version               # → 4.4.0 confirmed (already installed)
```

---

## Package Legitimacy Audit

> slopcheck was not available in this environment — all new packages tagged [ASSUMED] below. Planner must add `checkpoint:human-verify` before each install.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| @react-pdf/renderer | npm | >5 yrs (164 versions) | High — official react-pdf project | github.com/diegomura/react-pdf | [ASSUMED] | Approved (well-known OSS project, on Next.js auto-externalize list) |
| dejavu-fonts-ttf | npm | 9 yrs (2.37.3, last publish ~2016) | Low-moderate | github.com/senotrusov/dejavu-fonts-ttf | [ASSUMED] | Approved with checkpoint — old package, single maintainer, but assets-only (no runtime code execution) |

**Packages removed due to slopcheck [SLOP] verdict:** none

**Packages flagged as suspicious [SUS]:** none formally (slopcheck unavailable). `dejavu-fonts-ttf` is old with a single maintainer; however it contains only static TTF font files with no executable code, making supply-chain risk minimal.

*slopcheck was unavailable at research time — both packages above are tagged `[ASSUMED]`. The planner must gate each install behind a `checkpoint:human-verify` task.*

---

## Architecture Patterns

### System Architecture Diagram

```
Browser click "Download Excel/PDF"
        │
        ▼
GET /api/exports/{type}/{params}
        │
        ├─ auth() guard ──── no session ──→ 401 Unauthorized
        │
        ├─ tenant lookup (getDefaultTenantId())
        │
        ├─ [hakkediş handlers] status check ─── draft ──→ 403/422
        │
        ├─ Data fetch
        │   ├─ getCanonicalSubmissions(filters)     [EXP-01]
        │   ├─ getPeriodDetail(periodId)            [EXP-02, EXP-04]
        │   └─ getPortfolioPeople({role})           [EXP-03]
        │
        ├─ File generation
        │   ├─ Excel: ExcelJS.Workbook → xlsx.writeBuffer() → Uint8Array
        │   └─ PDF: renderToBuffer(<HakkedisPdf data={...} />) → Uint8Array
        │
        ├─ logOfficeActivity (fire-and-forget via after())
        │
        └─ new NextResponse(uint8Array, { Content-Type, Content-Disposition })
                │
                ▼
        Browser receives binary attachment → browser saves to disk
```

### Recommended Project Structure

```
src/
├── app/api/exports/
│   ├── submissions/route.ts          # GET  EXP-01: submission ledger Excel
│   ├── performance/route.ts          # GET  EXP-03: performance summary Excel
│   └── hakedis/[periodId]/
│       ├── route.ts                  # GET  EXP-02: BOQ/hakkediş Excel
│       └── pdf/route.ts             # GET  EXP-04: hakkediş PDF
├── lib/
│   ├── excel.ts                      # EXTEND: add buildSubmissionLedger(), buildHakedisExcel(), buildPerformanceSummary()
│   └── pdf/
│       ├── hakedis-pdf.tsx          # React-pdf JSX document component
│       └── fonts.ts                 # Font.register call (DejaVu Sans)
└── app/dashboard/(admin)/exports/
    └── page.tsx                      # REPLACE stub: hub page with trigger cards
```

### Pattern 1: Binary Route Handler (VERIFIED in existing codebase)

The exact pattern is already used in `src/app/dashboard/projects/[id]/boq-template/route.ts`:

```typescript
// Source: src/app/dashboard/projects/[id]/boq-template/route.ts (project codebase)
export const runtime = 'nodejs';    // Required — ExcelJS + react-pdf are Node-only
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ periodId: string }> }) {
  // D-114: auth guard is FIRST STATEMENT
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... data fetch + generation ...
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="hakkedis-HK-2025-01-project-name.xlsx"',
      'Content-Length': String(buffer.length),
    },
  });
}
```

**Key established facts from existing codebase:**
- `export const runtime = 'nodejs'` is already the pattern (Telegram webhook uses it)
- `new NextResponse(new Uint8Array(buffer), {...})` is the exact pattern used for the boq-template — Buffer must be converted to Uint8Array for BodyInit compatibility (documented in `src/lib/excel.ts` code comment from Phase 1-06 pitfall)
- `auth()` returns `null` on no session; check → 401 JSON response (NOT redirect) for binary endpoints

### Pattern 2: ExcelJS In-Memory Workbook (VERIFIED in existing codebase)

```typescript
// Source: src/lib/excel.ts (project codebase) — generateBoqTemplate() pattern
import ExcelJS from 'exceljs';

async function buildSubmissionLedger(submissions: CanonicalSubmission[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Gönderim Listesi');

  // Bold header row with bilingual D-111 headers
  sheet.columns = [
    { header: 'Dönem / Period', key: 'period', width: 20 },
    { header: 'Para Birimi / Currency', key: 'currency', width: 15 },
    { header: 'Net Ödeme / Net Payable', key: 'net', width: 18 },
    // ... etc
  ];
  // Make header row bold
  sheet.getRow(1).font = { bold: true };
  // Freeze pane on row 1
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of submissions) {
    sheet.addRow({ ... });
  }

  // D-116: money cells use numFmt, never parseFloat
  sheet.getColumn('quantity').numFmt = '#,##0.00';
  sheet.getColumn('unitPrice').numFmt = '#,##0.00';

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
```

**D-116 confirmed:** `numFmt: '#,##0.00'` applied to numeric columns. The decimal string from Postgres is assigned directly as the cell value (ExcelJS accepts numeric strings and applies the format). Currency in its own column per D-116.

### Pattern 3: @react-pdf/renderer with Font.register [CITED: react-pdf.org/fonts]

```typescript
// Source: react-pdf.org/fonts + react-pdf.org/node
import path from 'path';
import { Font, renderToBuffer, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// Call once at module scope (cached across invocations within the same warm instance)
Font.register({
  family: 'DejaVuSans',
  fonts: [
    { src: path.join(process.cwd(), 'public/fonts/DejaVuSans.ttf') },
    { src: path.join(process.cwd(), 'public/fonts/DejaVuSans-Bold.ttf'), fontWeight: 'bold' },
  ],
});

const styles = StyleSheet.create({
  body: { fontFamily: 'DejaVuSans', fontSize: 10 },
});

// In the route handler:
const buffer = await renderToBuffer(
  <Document title={period.periodNumber} author={session.user?.name ?? 'bayrak.ai'}>
    <Page size="A4" style={styles.body}>
      {/* ... */}
    </Page>
  </Document>
);
// buffer is a Node.js Buffer — wrap in Uint8Array for NextResponse
return new NextResponse(new Uint8Array(buffer), {
  headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="hakkedis-${slug}-${yyyymmdd}.pdf"`,
  },
});
```

**Critical: `export const runtime = 'nodejs'`** is REQUIRED on the PDF route handler. `@react-pdf/renderer` is auto-externalized by Next.js (on the official list), so no manual `serverExternalPackages` change is needed.

**Font path:** `path.join(process.cwd(), 'public/fonts/DejaVuSans.ttf')` — works in Vercel serverless because `public/` is bundled with the function. This is the confirmed pattern from community usage [CITED: multiple react-pdf GitHub issues].

### Pattern 4: Activity Log Extension (TypeScript-only, no migration)

```typescript
// src/db/schema/office-activity-log.ts — ADD to OFFICE_ACTION_TYPES array:
export const OFFICE_ACTION_TYPES = [
  // ... existing 16 types ...
  'hakedis_pdf_exported',
  'hakedis_excel_exported',
  'submission_ledger_exported',
  'performance_summary_exported',
] as const;
// IMPORTANT: text column (not pg enum) — no migration needed. Just extend the const array.
```

The `officeActivityLog.actionType` column is `text('action_type').notNull()` — the TypeScript `as const` array is a compile-time constraint only. Adding new strings to the array is a TypeScript-only change with zero DB impact.

### Pattern 5: Content-Disposition with Turkish filenames (D-112)

D-112 filenames contain Turkish characters only in the project slug derived from `projects.name`. A project named "İstanbul Doğalgaz Boru" would slug to `istanbul-dogalgaz-boru` (ASCII-safe). The slug derivation function should:
1. Normalize Turkish chars: İ→i, Ğ→g, Ş→s, Ü→u, Ö→o, Ç→c, ı→i, ğ→g, ş→s, ü→u, ö→o, ç→c
2. Lowercase + replace non-alphanumeric with `-`
3. Trim leading/trailing dashes

Result is always ASCII, so standard `filename="..."` in Content-Disposition is safe — RFC 5987 `filename*=UTF-8''...` is not needed.

**IMPORTANT:** `projects` table has a `name` column but NO `slug` column — slug derivation happens at route-handler time.

### Anti-Patterns to Avoid

- **Using `parseFloat()` on money strings in route handlers:** D-116 prohibits this. Assign the Postgres numeric string directly as the Excel cell value and use `numFmt` for formatting.
- **Cross-currency summation in Excel:** The `CanonicalSubmission.earnedValue` is already per-currency. The submission ledger must keep a separate `currencyCode` column; never sum across currencies.
- **PDF route handler without `export const runtime = 'nodejs'`:** Without this, Next.js may attempt to run the handler on Edge runtime, which doesn't have the Node.js `Buffer`/`fs` APIs that react-pdf uses.
- **Using `renderToStream` instead of `renderToBuffer`:** `renderToStream` returns a Node.js ReadableStream that requires Web ReadableStream conversion for NextResponse. `renderToBuffer` returns a Buffer that wraps directly as Uint8Array — simpler and matches the existing project pattern.
- **Calling `logOfficeActivity` BEFORE the primary write succeeds:** The existing pattern (all Phase 7 server actions) calls `logOfficeActivity` after the DB write; do the same in route handlers — call after generating + beginning to stream the response.
- **Redirecting on 401 for binary endpoints:** Binary content route handlers MUST return `NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`, never `redirect('/auth/signin')` — confirmed by existing `boq-template/route.ts` precedent.
- **Draft period exports:** The hakkediş Excel and PDF handlers MUST check `period.status !== 'draft'` after fetching the period; return 422 if draft. Client-side, the `PeriodDetailControls` already hides export buttons for `status === 'draft'` (defense in depth).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Turkish character rendering in PDF | Custom glyph substitution / HTML canvas font | `@react-pdf/renderer` with DejaVu Sans TTF (`Font.register`) | Glyph shaping and ligature handling are non-trivial; DejaVu has full Latin Extended-A coverage |
| Money formatting in Excel cells | `parseFloat()` + JS locale string | ExcelJS `cell.numFmt = '#,##0.00'` with raw Postgres decimal string as value | D-116; avoids float precision loss; Excel applies locale-aware grouping |
| PDF deduction math | Re-derive gross/kdv/net in route handler | Read `getPeriodDetail().deductions` directly | D-90 chain already computed in Postgres numeric; re-deriving risks precision divergence |
| Tenant-scoped query in route handler | Inline SQL in route handler | Call existing `getPeriodDetail()`, `getCanonicalSubmissions()`, `getPortfolioPeople()` | These are already auth-guarded and tenant-scoped; re-implementing risks IDOR |
| Node stream → Web ReadableStream conversion | `PassThrough` + `ReadableStream` from async iterator | `ExcelJS.Workbook.xlsx.writeBuffer()` → `Uint8Array` | `writeBuffer()` already returns a complete Buffer; no streaming conversion needed |

**Key insight:** All data layer queries and financial computations are already built. Phase 11 is a presentation layer on top of frozen data — the hardest problems (Postgres numeric precision, tenant scoping, deduction chain) are solved.

---

## Existing Data Layer Surface Area (Verified by Code Reading)

### `getCanonicalSubmissions(filters: SubmissionFilters)` → `Promise<CanonicalSubmission[]>`

Returns all submissions for the tenant. Key fields for the submission ledger Excel:
- `id`, `projectId`, `projectName`, `personId`, `workerName`, `auditorName`
- `boqItemId`, `material`, `unit`, `unitPrice` (string or null), `currencyCode`
- `quantity` (string), `earnedValue` (string or null)
- `status`, `submittedAt`, `decidedAt`, `auditLatencyHours`
- `locationMatch`, `locationDistanceM`, `photoUrl`, `notes`, `rejectionReason`

**Default limit is 1000.** For a full ledger export, the route handler MUST pass `limit: Number.MAX_SAFE_INTEGER` (or a very large number like 100000) to override the default and fetch all rows. The function supports arbitrary `limit` values as bound parameters.

**Filter params needed by the route handler:** The exports hub passes `from`, `to`, `projectIds` via query string; the route handler parses them and passes to `getCanonicalSubmissions`. Auth + tenant scope is inside the function.

### `getPortfolioPeople(options)` → `Promise<PortfolioWorker[]> | Promise<PortfolioAuditor[]>`

Two overloads: `role: 'worker'` → `PortfolioWorker[]`; `role: 'auditor'` → `PortfolioAuditor[]`.

**Workers tab columns (D-110):**
- `displayName`, `submissionsApproved`, `submissionsRejected`, `submissionsPending`
- `valueContributedByCurrency: Record<string, string>` — one row per currency (renderer must iterate keys)

**Auditors tab columns (D-110):**
- `displayName`, `decisionsCount`, `avgDecisionLatencyHours`, `pendingBacklogCount`, `slaBreachRateDecided`
- No value-by-currency for auditors

### `getPeriodDetail(periodId)` → `Promise<{period, lines, deductions, unpricedItems}>`

The single source of truth for both EXP-02 and EXP-04.

**`period: PeriodHeader`** fields needed for PDF cover page and Yeşil Defter header:
- `periodNumber`, `periodStartDate`, `periodEndDate`, `currencyCode`, `status`
- `kdvRate`, `retentionRate`, `tevkifatFraction`, `stopajEnabled`, `stopajRate`, `avansKesintisiRate`
- `finalizedAt`

**`lines: PeriodLine[]`** fields (Fiyat İcmali + Yeşil Defter):
- `materialSnapshot`, `unitSnapshot`, `currencyCodeSnapshot`, `unitPriceSnapshot`
- `cumulativeQtyApproved`, `previousCumulativeQty`, `periodQty` (GENERATED), `periodValue`, `cumulativeValue`

**`deductions: PeriodDeductions | null`** (Hesap Özeti sheet + PDF payment summary):
- `gross`, `kdv`, `tevkifat`, `stopaj`, `teminat`, `avans`, `net` — all decimal strings
- `null` when period has no lines — route handler should return 422 in that case

**Note:** `deductions` is `null` for an empty period (no approved items). The export handlers should handle this: return a 422 with an appropriate error if deductions are null.

### New Query Needed: `getAllNonDraftPeriods()` for the Exports Hub Period Picker

`getPeriodsByProject(projectId)` fetches one project's periods. The Exports hub needs ALL non-draft periods across ALL projects in the tenant for the period picker table. A new server action (or inline query in page.tsx following the tenant-scoped auth pattern) is required:

```sql
SELECT hp.id, hp.period_number, hp.period_end_date, hp.currency_code, hp.status,
       p.name AS project_name,
       -- net_by_display subquery (same as getPeriodsByProject)
FROM hakedis_periods hp
JOIN projects p ON p.id = hp.project_id
WHERE hp.tenant_id = $tenantId
  AND hp.status != 'draft'
ORDER BY hp.period_end_date DESC
```

This is additive — a new `getAllFinishedPeriods()` exported from `src/actions/hakedis.ts`.

---

## Content-Disposition Filename Construction

D-112 requires `projectSlug` derived from `projects.name` (no slug column exists). Required helper:

```typescript
// src/lib/slug.ts (new small helper)
export function toSlug(name: string): string {
  return name
    .normalize('NFD')                        // decompose accents
    .replace(/[̀-ͯ]/g, '')         // strip combining marks
    .replace(/[İI]/g, 'i')                   // Turkish capital I variants
    .replace(/[Şş]/g, 's')
    .replace(/[Ğğ]/g, 'g')
    .replace(/[Üü]/g, 'u')
    .replace(/[Öö]/g, 'o')
    .replace(/[Çç]/g, 'c')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
// "İstanbul Doğalgaz" → "istanbul-dogalgaz"
```

---

## Bilingual Header Strings for All Sheets (D-111)

### Submission Ledger (EXP-01)

| Column | TR / EN Header |
|--------|---------------|
| Submission ID | `ID / ID` |
| Proje / Project | `Proje / Project` |
| Personel / Person | `Personel / Person` |
| Denetçi / Auditor | `Denetçi / Auditor` |
| Malzeme / Material | `Malzeme / Material` |
| Birim / Unit | `Birim / Unit` |
| Miktar / Quantity | `Miktar / Quantity` |
| Birim Fiyat / Unit Price | `Birim Fiyat / Unit Price` |
| Para Birimi / Currency | `Para Birimi / Currency` |
| Kazanılan Değer / Earned Value | `Kazanılan Değer / Earned Value` |
| Durum / Status | `Durum / Status` |
| Gönderim Tarihi / Submitted At | `Gönderim Tarihi / Submitted At` |
| Karar Tarihi / Decided At | `Karar Tarihi / Decided At` |
| Konum Uyumu / Location Match | `Konum Uyumu / Location Match` |

### Yeşil Defter sheet (EXP-02)

| Column | TR / EN Header |
|--------|---------------|
| Malzeme / Material | `Malzeme / Material` |
| Birim / Unit | `Birim / Unit` |
| Birim Fiyat / Unit Price | `Birim Fiyat / Unit Price` |
| Para Birimi / Currency | `Para Birimi / Currency` |
| Önceki Birikimli / Previous Cumulative | `Önceki Birikimli / Previous Cumulative` |
| Birikimli Miktar / Cumulative Qty | `Birikimli Miktar / Cumulative Qty` |
| Dönem Miktarı / Period Qty | `Dönem Miktarı / Period Qty` |
| Dönem Tutarı / Period Value | `Dönem Tutarı / Period Value` |
| Birikimli Tutar / Cumulative Value | `Birikimli Tutar / Cumulative Value` |

### Fiyat İcmali sheet (EXP-02)

| Column | TR / EN Header |
|--------|---------------|
| Malzeme / Material | `Malzeme / Material` |
| Birim / Unit | `Birim / Unit` |
| Dönem Miktarı / Period Qty | `Dönem Miktarı / Period Qty` |
| Birim Fiyat / Unit Price | `Birim Fiyat / Unit Price` |
| Para Birimi / Currency | `Para Birimi / Currency` |
| Dönem Tutarı / Period Value | `Dönem Tutarı / Period Value` |

### Hesap Özeti sheet (EXP-02) — label rows (not column headers)

These are row labels in a two-column layout (label | value):

| Row label | TR / EN |
|-----------|---------|
| Brüt Hakediş / Gross | `Brüt Hakediş / Gross` |
| KDV | `KDV / VAT` |
| KDV Tevkifat | `KDV Tevkifat / VAT Withholding` |
| Stopaj | `Stopaj / Withholding Tax` |
| Teminat / Retention | `Teminat / Retention` |
| Avans Kesintisi / Advance Deduction | `Avans Kesintisi / Advance Deduction` |
| **Net Ödeme / Net Payable** | `Net Ödeme / Net Payable` |

### Workers tab (EXP-03)

| Column | TR / EN Header |
|--------|---------------|
| Personel / Person | `Personel / Person` |
| Onaylanan / Approved | `Onaylanan / Approved` |
| Reddedilen / Rejected | `Reddedilen / Rejected` |
| Bekleyen / Pending | `Bekleyen / Pending` |
| Konum Uyumu / Location Compliance | `Konum Uyumu / Location Compliance` |
| Çıktı Miktarı / Output Qty | `Çıktı Miktarı / Output Qty` |
| Para Birimi / Currency | `Para Birimi / Currency` |
| Değer Katkısı / Value Contribution | `Değer Katkısı / Value Contribution` |

### Auditors tab (EXP-03)

| Column | TR / EN Header |
|--------|---------------|
| Personel / Person | `Personel / Person` |
| Karar Sayısı / Decision Count | `Karar Sayısı / Decision Count` |
| Ort. Süre (saat) / Avg Latency (hrs) | `Ort. Süre (saat) / Avg Latency (hrs)` |
| Bekleyen / Pending Backlog | `Bekleyen / Pending Backlog` |
| SLA İhlal Oranı / SLA Breach Rate | `SLA İhlal Oranı / SLA Breach Rate` |

---

## Common Pitfalls

### Pitfall 1: "PDFDocument is not a constructor" in Next.js 15
**What goes wrong:** `@react-pdf/renderer` uses Node.js internals that fail when bundled by Next.js webpack.
**Why it happens:** Next.js bundles Server Component / Route Handler code; react-pdf uses internal pdfkit that conflicts with webpack's module resolution.
**How to avoid:** `export const runtime = 'nodejs'` on the PDF route handler. This is necessary AND sufficient because `@react-pdf/renderer` is already on Next.js's automatic `serverExternalPackages` list (confirmed in Next.js 15.0.0+ docs) — it loads as native `require` without webpack bundling.
**Warning signs:** Error message "PDFDocument is not a constructor" or "ba.Component is not a constructor" in route handler logs.

### Pitfall 2: Float precision in Excel cells (D-116)
**What goes wrong:** Using `parseFloat(row.gross)` before assigning to an Excel cell converts the Postgres `numeric` string through JS float, losing precision (e.g., `1234567.89` becomes `1234567.8899999998`).
**Why it happens:** JS float is IEEE 754 double precision; many decimal fractions are not representable exactly.
**How to avoid:** Assign the Postgres decimal string directly to the Excel cell as a string and apply `numFmt`. ExcelJS renders formatted numeric strings correctly. For financial columns: `cell.value = row.gross; cell.numFmt = '#,##0.00';`
**Warning signs:** Small discrepancies in Hesap Özeti values vs. on-screen deduction chain.

### Pitfall 3: Default limit=1000 in getCanonicalSubmissions
**What goes wrong:** The submission ledger Excel silently truncates at 1000 rows for large projects.
**Why it happens:** `getCanonicalSubmissions` defaults `limit` to 1000 when not passed.
**How to avoid:** The route handler for EXP-01 must pass an explicit high limit (e.g., `limit: 100_000`) or loop with pagination. A single large-limit call is acceptable for v1 (single-tenant, bounded dataset).
**Warning signs:** Row count in Excel doesn't match filter count shown on the records page.

### Pitfall 4: WOFF2 font not supported by react-pdf
**What goes wrong:** Using the Inter font from `next/font/google` for PDF generation. Inter is fetched as WOFF2 by Next.js; WOFF2 is NOT reliably supported by react-pdf (official docs: "TTF and WOFF files are supported").
**Why it happens:** `next/font` optimizes by serving WOFF2 for browsers; the `.woff2` files in `.next/static/media/` are not accessible to `@react-pdf/renderer` Font.register in Node context.
**How to avoid:** Use `dejavu-fonts-ttf` package. Place `DejaVuSans.ttf` in `public/fonts/`. Use `path.join(process.cwd(), 'public/fonts/DejaVuSans.ttf')` as the `src` in `Font.register`.
**Warning signs:** Turkish glyphs rendered as blank rectangles or question marks in the PDF.

### Pitfall 5: Draft period export
**What goes wrong:** A hakkediş Excel or PDF is generated for a draft period (which has mutable data and possibly `null` deductions).
**Why it happens:** Route handler only checks auth, not period status.
**How to avoid:** After fetching period in `getPeriodDetail()`, check `period.status === 'draft'` → return `NextResponse.json({ error: 'Period is not finalized' }, { status: 422 })`. Client-side, `PeriodDetailControls` already hides export buttons for draft status (defense in depth).
**Warning signs:** `deductions` is `null` in `getPeriodDetail()` result when there are no lines; period has `status: 'draft'`.

### Pitfall 6: Missing `export const runtime = 'nodejs'` on route handlers
**What goes wrong:** Next.js may attempt Edge runtime for route handlers without explicit runtime declaration. ExcelJS and @react-pdf/renderer both require Node.js APIs.
**Why it happens:** Default runtime for App Router route handlers may vary; being explicit prevents edge deployment.
**How to avoid:** Add `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'` at the top of EVERY export route handler (4 handlers). The Telegram webhook precedent already uses this pattern.
**Warning signs:** Build errors about Node.js modules (`fs`, `Buffer`, etc.) not being available in Edge runtime.

### Pitfall 7: getCanonicalSubmissions is a 'use server' action, not callable from route handlers directly
**What goes wrong:** Attempting to call `getCanonicalSubmissions` from a route handler throws if the internal `auth()` call uses session cookies in a way that differs from route handler context.
**Why it happens:** `'use server'` actions and route handlers both run in Node.js server context, and both can call `auth()`. However, `auth()` in the server action reads from request cookies via Next.js context — this context IS available in route handlers via `next/headers`.
**How to avoid:** `auth()` from Auth.js v5 works in both server actions and route handlers (uses `next/headers` under the hood). The route handler calls `auth()` directly (as its first statement per D-114); it does NOT need to call the server action wrapper. Instead, duplicate the tenant + DB query pattern from inside `getCanonicalSubmissions` directly in the route handler helper function — or call the action directly and note that `auth()` inside it will use the route handler's request context correctly.
**Recommendation:** The simplest approach is to call the existing server actions (`getCanonicalSubmissions`, `getPeriodDetail`, `getPortfolioPeople`) directly from route handlers. Auth.js v5's `auth()` works in both contexts. The `boq-template/route.ts` precedent calls a plain helper function (`generateBoqTemplate`); for Phase 11, the route handlers call the server actions for data and `src/lib/excel.ts` helpers for formatting.

### Pitfall 8: valueContributedByCurrency multi-currency in performance summary Excel
**What goes wrong:** `PortfolioWorker.valueContributedByCurrency` is a `Record<string, string>` with one entry per currency. If a worker contributed in TRY and USD, there are two entries. A naive single `value` column doesn't represent this correctly.
**Why it happens:** The multi-currency model (D-67) propagates to the performance summary.
**How to avoid:** For EXP-03, emit one row per worker per currency for the value contribution. Or, if value contribution is the last column set, include all currencies as separate columns. The simplest v1 approach: if a worker has multiple currencies, repeat the worker row once per currency (with currency code in its own column).

---

## Runtime State Inventory

This is a greenfield phase (new route handlers + new page). No rename/refactor involved.

**Nothing found in any category — verified:**
- No stored data references "exports" in a way that needs migration
- No live service config changes (no n8n workflows, no Datadog tags)
- No OS-registered state
- No new env vars required (all existing: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`)
- No build artifacts to reinstall

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js runtime | ExcelJS + @react-pdf/renderer | ✓ | ≥18.x (Vercel) | — |
| `public/` folder | DejaVu Sans TTF placement | ✓ | Exists (has existing SVG assets) | — |
| ExcelJS | EXP-01, EXP-02, EXP-03 | ✓ | 4.4.0 (already installed) | — |
| @react-pdf/renderer | EXP-04 | ✗ | Not installed — must install 4.5.1 | — |
| dejavu-fonts-ttf | EXP-04 (font file) | ✗ | Not installed — must install 2.37.3 | Download TTF from dejavu-fonts.github.io directly |
| next.config.ts serverExternalPackages | @react-pdf/renderer Node compat | Auto (already on official list) | Next.js 15.0.0+ | Explicit add if auto fails |

**Missing dependencies with no fallback:**
- `@react-pdf/renderer@4.5.1` — must be installed before PDF route handler implementation
- `dejavu-fonts-ttf@2.37.3` OR manually placed `DejaVuSans.ttf` in `public/fonts/` — font file must exist at deploy time

**Missing dependencies with fallback:**
- None (the font file can be sourced directly from dejavu-fonts.github.io/Download.html if the npm package check fails)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (configured in `vitest.config.ts`) |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run --reporter=verbose tests/exports/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXP-01 | Submission ledger route returns 401 without session | Integration | `npx vitest run tests/exports/submissions.test.ts -t "401"` | ❌ Wave 0 |
| EXP-01 | Submission ledger route returns 200 + correct row count | Integration | `npx vitest run tests/exports/submissions.test.ts -t "row count"` | ❌ Wave 0 |
| EXP-01 | Submission ledger scopes by tenant (no cross-tenant rows) | Integration | `npx vitest run tests/exports/submissions.test.ts -t "tenant"` | ❌ Wave 0 |
| EXP-02 | Hakkediş Excel route returns 401 without session | Integration | `npx vitest run tests/exports/hakedis-excel.test.ts -t "401"` | ❌ Wave 0 |
| EXP-02 | Hakkediş Excel route returns 422 for draft period | Integration | `npx vitest run tests/exports/hakedis-excel.test.ts -t "draft"` | ❌ Wave 0 |
| EXP-02 | Hesap Özeti gross cell matches getPeriodDetail().deductions.gross | Integration | `npx vitest run tests/exports/hakedis-excel.test.ts -t "gross"` | ❌ Wave 0 |
| EXP-03 | Performance summary route returns 401 without session | Integration | `npx vitest run tests/exports/performance.test.ts -t "401"` | ❌ Wave 0 |
| EXP-04 | PDF route returns 401 without session | Integration | `npx vitest run tests/exports/hakedis-pdf.test.ts -t "401"` | ❌ Wave 0 |
| EXP-04 | PDF route returns 422 for draft period | Integration | `npx vitest run tests/exports/hakedis-pdf.test.ts -t "draft"` | ❌ Wave 0 |
| EXP-04 | PDF binary contains embedded font name (DejaVu or Inter) | Integration | `npx vitest run tests/exports/hakedis-pdf.test.ts -t "font"` | ❌ Wave 0 |
| EXP-04 | PDF binary contains Turkish text (period number with Turkish chars) | Integration | `npx vitest run tests/exports/hakedis-pdf.test.ts -t "turkish"` | ❌ Wave 0 |
| D-109 | Activity log row inserted for each export action type | Integration | `npx vitest run tests/exports/activity-log.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/exports/ --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/exports/submissions.test.ts` — covers EXP-01 auth, tenant scope, row count
- [ ] `tests/exports/hakedis-excel.test.ts` — covers EXP-02 auth, draft guard, Hesap Özeti precision
- [ ] `tests/exports/performance.test.ts` — covers EXP-03 auth, two-tab structure
- [ ] `tests/exports/hakedis-pdf.test.ts` — covers EXP-04 auth, draft guard, font embedding, Turkish text
- [ ] `tests/exports/activity-log.test.ts` — covers D-109 four new action types
- [ ] `tests/exports/helpers/slug.test.ts` — covers toSlug() Turkish char normalization

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `auth()` first statement in every route handler; HTTP 401 on null session (D-114) |
| V3 Session Management | via Auth.js | Auth.js v5 handles session tokens — no custom session code |
| V4 Access Control | yes | Tenant scope: every query uses `WHERE tenant_id = ${tenantId}` via existing action functions |
| V5 Input Validation | yes | `periodId` is a route segment — validate as UUID before DB query; query string `from`/`to`/`projectIds` parsed as dates/UUIDs with bound params |
| V6 Cryptography | no | No new crypto operations |

### Known Threat Patterns for Export Route Handlers

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR via periodId in URL | Information Disclosure | `getPeriodDetail` verifies `tenant_id = ${tenantId}` — cross-tenant period fetch returns 404 |
| Draft period snapshot bypass | Tampering | `period.status === 'draft'` check → 422; client-side button removed for draft status |
| SQL injection via query string params | Tampering | All filter values passed as Drizzle `sql`` bound parameters via existing action functions |
| Unauthorized export of financial data | Information Disclosure | `auth()` first statement; binary 401 response (not redirect); logs every export via D-109 |
| Overly large export DoS | Denial of Service | `getCanonicalSubmissions` default limit 1000; explicit high limit (100k) for export — acceptable for single-tenant v1; add `Content-Length` header |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `experimental.serverComponentsExternalPackages` | `serverExternalPackages` (stable, top-level) | Next.js v15.0.0 | `@react-pdf/renderer` is on the automatic list — no manual config needed |
| `renderToStream` → convert to Web ReadableStream | `renderToBuffer` → `Uint8Array` | react-pdf has always had both; `writeBuffer` is simpler for serverless | Simpler, matches existing project pattern |
| Explicit font registration on every request | Module-scope `Font.register` (cached per warm instance) | Always correct | Avoids re-fetching/re-parsing TTF on every PDF request |

**Deprecated/outdated:**
- `experimental.serverComponentsExternalPackages`: renamed to `serverExternalPackages` in Next.js 15.0.0. Do not use the `experimental` version.
- `workbook.xlsx.write(expressResponse)`: Express-style streaming. Not applicable to Next.js App Router. Use `writeBuffer()` → `Uint8Array` instead.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@react-pdf/renderer` auto-externalized by Next.js is sufficient; no explicit `serverExternalPackages` entry needed in `next.config.ts` | Standard Stack / Pitfall 1 | If auto-externalize doesn't resolve the issue, add `'@react-pdf/renderer'` to the existing `serverExternalPackages` array in `next.config.ts` — low cost fix |
| A2 | `dejavu-fonts-ttf@2.37.3` TTF files include full Latin Extended-A block (Turkish ğ ş ı ö ü ç etc.) | Standard Stack | If Turkish glyphs are missing, use Noto Sans TTF from fontsource instead |
| A3 | `process.cwd()` in a Vercel serverless function correctly points to the project root where `public/fonts/` is bundled | Architecture Patterns / Font path | If not, use `fs.readFileSync` + Buffer as the `src` value, or fetch the font from a known Vercel Blob URL |
| A4 | `auth()` from Auth.js v5 called inside a route handler reads the session cookie correctly from the incoming request (same as in server actions) | Architecture Patterns | Auth.js v5 uses `next/headers` internally — confirmed by existing `boq-template/route.ts` which already calls `auth()` in a route handler |
| A5 | ExcelJS `numFmt: '#,##0.00'` applied with a Postgres decimal string as cell value produces correct Excel output without float conversion | Standard Stack / Pitfall 2 | ExcelJS may require a numeric type (number) for numFmt to render correctly; if so, use `new Decimal(str).toNumber()` with documented precision risk only for display-only cells |
| A6 | `getCanonicalSubmissions` called from a route handler (not a server action context) works correctly — `auth()` inside it reads the request's session cookie | Pitfall 7 | Test explicitly in Wave 1 — if auth fails in route handler context, inline the tenant query in a route-handler-specific helper |
| A7 | The `dejavu-fonts-ttf` package is safe (single maintainer, old package, assets-only TTF files — no executable code risk) | Package Legitimacy Audit | Run manual inspection: verify the package contains only .ttf files, no postinstall scripts |

**If this table is empty:** Not empty — seven assumptions logged above.

---

## Open Questions (RESOLVED)

1. **Does calling existing server actions (`getCanonicalSubmissions`, `getPeriodDetail`) from a route handler work in practice?**
   - What we know: Auth.js v5's `auth()` uses `next/headers` and works in both server actions and route handlers. The existing `boq-template/route.ts` calls `auth()` directly (not via a server action). The Phase 11 pattern could either call the action directly or inline the query.
   - What's unclear: Whether `'use server'` marked functions can be imported into route handlers without the Next.js transform causing issues.
   - Recommendation: Implement route handlers by calling the server action functions directly (they are async functions — the `'use server'` directive is a build-time hint, not a runtime restriction for same-process calls). If issues arise, inline the DB query directly in the route handler helper.
   - **RESOLVED:** `'use server'` actions work directly when imported by route handlers — they are plain async functions at runtime; the directive is a build-time marker for the RSC payload boundary, not a runtime restriction for same-process calls. Plan 11-02 Wave 2 ships a test that imports `getCanonicalSubmissions` from `@/actions/analytics` and invokes the EXP-01 route handler end-to-end under `describeIfDb` — green = confirmation. If that test fails, inline the SQL into the route handler per the original fallback.

2. **D-112 filename RFC 5987 — is ASCII-safe slug sufficient?**
   - What we know: Projects have Turkish names (`projects.name`). D-112 requires `projectSlug` in filenames. RFC 5987 `filename*=UTF-8''...` would handle UTF-8 filenames but adds implementation complexity.
   - What's unclear: Whether browsers correctly handle ASCII filenames derived from Turkish names in the project context.
   - Recommendation: Use ASCII slug derivation (Turkish char normalization → ASCII). D-112 filenames are for office engineers who manage multiple projects — an ASCII slug is sufficient for file-system sorting and identification. No RFC 5987 needed.
   - **RESOLVED:** ASCII-slugify Turkish characters via the `toSlug()` helper shipped in Plan 11-01b (`İ/I → i`, `Ş/ş → s`, `Ğ/ğ → g`, `Ü/ü → u`, `Ö/ö → o`, `Ç/ç → c`, then lowercase, then `[^a-z0-9]+ → '-'`, then trim). All four route handlers feed `projectName` through `toSlug()` before composing `Content-Disposition: attachment; filename="..."`. No RFC 5987 `filename*=UTF-8''...` encoding needed; office-engineer filename ergonomics + cross-OS filesystem sorting are satisfied by ASCII output.

3. **Performance tab: multi-currency value contribution layout**
   - What we know: `PortfolioWorker.valueContributedByCurrency` can have multiple currency entries. D-110 says "value contribution by currency" as a column.
   - What's unclear: Whether to emit one row per worker-currency combination, or to concatenate all currency values into a single cell.
   - Recommendation: Emit one row per worker per currency (simpler for Excel consumption). Workers with no value contribution get one row with empty value columns. This mirrors how the portal renders currency-grouped data.
   - **RESOLVED:** One row per worker; currency code in a separate column (`Para Birimi / Currency`). When a worker has multiple currencies in `valueContributedByCurrency`, emit the `valueContributedByCurrency` map as a JSON-stringified value in a single cell of the `Değer Katkısı / Value Contribution` column on that single row (planner discretion in Plan 11-03; ExcelJS string cell — display layer only, no parseFloat). Workers with zero currencies emit one row with blank currency + value cells so they still appear in counts. This supersedes the "one row per worker-currency pair" recommendation above to honour the user's D-110 layout direction (one row per worker).

---

## Sources

### Primary (HIGH confidence)
- Next.js docs, `serverExternalPackages` page (v15, updated 2026-05-27) — confirms `@react-pdf/renderer` is auto-externalized [VERIFIED]
- Project codebase: `src/app/dashboard/projects/[id]/boq-template/route.ts` — exact binary route handler pattern [VERIFIED]
- Project codebase: `src/lib/excel.ts` — ExcelJS in-memory workbook + writeBuffer() pattern [VERIFIED]
- Project codebase: `src/db/schema/office-activity-log.ts` — OFFICE_ACTION_TYPES extension pattern (text column, no migration) [VERIFIED]
- Project codebase: `src/actions/analytics.ts` — `getCanonicalSubmissions`, `getPortfolioPeople` type signatures [VERIFIED]
- Project codebase: `src/actions/hakedis.ts` — `getPeriodDetail` return types, deduction chain [VERIFIED]
- Project codebase: `next.config.ts` — existing `serverExternalPackages` array; `@react-pdf/renderer` not listed (auto-externalized) [VERIFIED]
- Project codebase: `src/app/layout.tsx` — Inter loaded via `next/font/google` as WOFF2 (not TTF) — confirms DejaVu Sans needed [VERIFIED]
- react-pdf.org/fonts — Font.register API; TTF and WOFF supported; absolute path for Node [CITED: https://react-pdf.org/fonts]
- react-pdf.org/node — renderToBuffer returns Node.js Buffer [CITED: https://react-pdf.org/node]

### Secondary (MEDIUM confidence)
- npm registry: `@react-pdf/renderer@4.5.1`, `dejavu-fonts-ttf@2.37.3`, `exceljs@4.4.0` — versions confirmed [CITED: npmjs.com]
- react-pdf.org/compatibility — React 19 supported since v4.1.0; Next.js ≥14.1.1 supported [CITED: https://react-pdf.org/compatibility]
- ExcelJS GitHub issue #741 — workbook.xlsx.write(stream) pattern [CITED: github.com/exceljs/exceljs/issues/741]
- ericburel.tech/blog/nextjs-stream-files — Node stream to Web ReadableStream conversion (not needed given writeBuffer pattern) [CITED]

### Tertiary (LOW confidence)
- react-pdf GitHub issue #3074 — "PDFDocument is not a constructor" in Next.js 15; unresolved in issue body but auto-externalize is the fix [WebSearch + partial fetch]
- Community pattern: `path.join(process.cwd(), 'public/fonts/...')` for Font.register in serverless — multiple GitHub issue comments [WebSearch, unverified in Context7]

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 11 |
|-----------|-------------------|
| Next.js App Router monolith on Vercel | All exports are route handlers under `src/app/api/exports/` |
| ExcelJS already listed in stack | No alternative Excel library; use `writeBuffer()` pattern from existing `src/lib/excel.ts` |
| money-in-Postgres + decimal.js | D-116: assign Postgres decimal strings directly to Excel cells with `numFmt`; never `parseFloat` in route handler |
| next-intl 4.x TR/EN parity | i18n keys must be added to BOTH `messages/en.json` and `messages/tr.json`; 419 keys in each today (becomes 419 + new keys after phase) |
| shadcn via `node_modules/.bin/shadcn add` (NOT `npx shadcn@latest`) | UI-SPEC confirms no new shadcn components needed; all required components already installed |
| `export const dynamic = 'force-dynamic'` on all financial pages | Apply to `exports/page.tsx` (hub replacement) |
| Istanbul tz dates | Date cells in Excel: write as Date objects with `numFmt: 'dd.MM.yyyy'` |
| `auth()` guard as first statement on every route.ts | 4 new route handlers; each starts with `const session = await auth()` → 401 on null |
| Single-tenant MVP (`getDefaultTenantId()`) | All queries use `WHERE tenant_id = ${getDefaultTenantId()}` |
| Additive `(admin)` routes only | `exports/page.tsx` replaces stub (same path); no existing routes moved |

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — ExcelJS and react-pdf both verified on npm registry; react-pdf auto-externalize confirmed in official Next.js docs; existing project codebase provides direct code precedents
- Architecture: HIGH — binary route handler pattern is copied verbatim from `boq-template/route.ts`; data layer is fully read from codebase
- Pitfalls: HIGH for ExcelJS/auth (from codebase); MEDIUM for react-pdf/font (from official docs + community issues)

**Research date:** 2026-05-28
**Valid until:** 2026-07-28 (ExcelJS/Next.js stable; react-pdf compatibility worth re-checking before implementation if more than 30 days pass)
