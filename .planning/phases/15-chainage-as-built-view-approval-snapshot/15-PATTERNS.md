# Phase 15: Chainage As-Built View + Approval Snapshot — Pattern Map

**Mapped:** 2026-05-30
**Files analyzed:** 11 new/modified files
**Analogs found:** 11 / 11

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/bot-audit.ts` (MODIFY) | service | event-driven | `src/lib/bot-audit.ts` lines 404–536 | self (insertion point documented) |
| `src/db/migrations/0013_v4_chainage_backfill.sql` (NEW) | migration | batch | `src/db/migrations/0010_v4_routes_ext.sql` | exact |
| `src/actions/chainage.ts` (NEW) | service | CRUD/batch | `src/actions/analytics.ts` | role-match |
| `src/lib/format-chainage.ts` (NEW) | utility | transform | `src/lib/spatial.ts` → `formatDistance` | role-match |
| `src/lib/pdf/chainage-pdf.tsx` (NEW) | utility | file-I/O | `src/lib/pdf/hakedis-pdf.tsx` | exact |
| `src/components/dashboard/ChainageTab.tsx` (NEW) | component | request-response | `src/components/dashboard/RouteTab.tsx` | exact |
| `src/components/dashboard/ChainageTable.tsx` (NEW) | component | event-driven | `src/components/dashboard/RouteTabClient.tsx` | role-match |
| `src/components/dashboard/ChainageOffsetForm.tsx` (NEW) | component | request-response | existing form client components | role-match |
| `src/app/api/exports/chainage/route.ts` (NEW) | route | file-I/O | `src/app/api/exports/submissions/route.ts` | exact |
| `src/app/dashboard/projects/[id]/page.tsx` (MODIFY) | route | request-response | `src/app/dashboard/projects/[id]/page.tsx` lines 44–133 | self (insertion point documented) |
| `src/actions/analytics.ts` + `src/lib/types/canonical-submission.ts` + `src/components/admin/SubmissionDetailView.tsx` (MODIFY) | service + type + component | request-response | self (additive extension) | self |
| `src/lib/types/canonical-submission.ts` (MODIFY) | type | transform | `src/lib/types/canonical-submission.ts` | self |
| `tests/chainage.test.ts` (NEW) | test | batch | `tests/spatial.test.ts` / `tests/postgis.test.ts` | role-match |

---

## Pattern Assignments

---

### `src/lib/bot-audit.ts` — MODIFY: chainage snapshot write (APPROVE path only)

**Analog:** Self — the existing `handleAuditDecision` approve block (lines 404–536) plus the Phase 12 `recomputeHakedisLine` hook (lines 488–506).

**Insertion point** (lines 447–462, inside `txDb.transaction`):
```typescript
// src/lib/bot-audit.ts lines 415–449 — the existing approve transaction
await txDb.transaction(async (tx) => {
  const { submissions: sub2 } = await import('@/db/schema/submissions');
  const { boqItems: boq2 } = await import('@/db/schema/boq-items');
  const { eq: eq2, and: and2, sql: sql2 } = await import('drizzle-orm');

  // Step 1 (existing): atomic status flip + RETURNING
  const affected = await tx
    .update(sub2)
    .set({
      status: 'approved',
      decidedBy: auditorPerson.id,
      decidedAt: new Date(),
    })
    .where(and2(eq2(sub2.id, submissionId), eq2(sub2.status, 'pending_audit')))
    .returning({
      id: sub2.id,
      quantity: sub2.quantity,
      boqItemId: sub2.boqItemId,
      // [NEW Phase 15] ADD to returning:
      // segmentFraction: sub2.segmentFraction,
      // projectId: sub2.projectId,
    });

  if (affected.length === 0) throw new AlreadyResolvedError();

  // Step 2 (existing): BOQ approved_qty increment
  await tx
    .update(boq2)
    .set({ approvedQty: sql2`approved_qty + ${affected[0].quantity}` })
    .where(eq2(boq2.id, affected[0].boqItemId));

  // [NEW Phase 15] Step 3: fetch route snapshot within same TX (consistent read)
  // [NEW Phase 15] Step 4: write chainage_m + route_geometry_version (Postgres ROUND)
});
```

**Phase 12 post-commit hook pattern** (lines 488–506) — the chainage hook follows this EXACT structure after `editAllSiblingMessages`:
```typescript
// src/lib/bot-audit.ts lines 488–506
try {
  const hakedisActions = await import('@/actions/hakedis');
  const { boqItems } = await import('@/db/schema/boq-items');
  const { eq: eqHak } = await import('drizzle-orm');
  const boqRows = await db
    .select({ currencyCode: boqItems.currencyCode, projectId: boqItems.projectId })
    .from(boqItems)
    .where(eqHak(boqItems.id, boqItemId));
  if (boqRows.length > 0) {
    await hakedisActions.recomputeHakedisLine(
      boqRows[0].projectId,
      boqItemId,
      boqRows[0].currencyCode,
    );
  }
} catch (hakErr) {
  // D-40 best-effort: log, do not throw. The approval is already committed.
  console.error('[handleAuditDecision] hakkediş recompute failed for submission', submissionId, ':', hakErr);
}
```

**Critical constraints copied from file:**
- NEVER call `auth()`, `logOfficeActivity`, or `after()` in this file (Pitfall 5).
- NEVER import `auth` from `@/lib/auth` — the bot path has no Auth.js session.
- All DB access inside the TX uses the `txDb` pool (neon-serverless), not `@/db` (neon-http).
- Two `.update()` calls inside the same `txDb.transaction` block is the established pattern (BOQ increment already does this at line 444–449).
- `sql2`` template for Postgres-side arithmetic — consistent with `sql2\`approved_qty + ${affected[0].quantity}\`` at line 447.

**getTxDb cleanup pattern** (lines 32–51 and 458–462):
```typescript
const { db: txDb, cleanup: txCleanup } = await getTxDb();
try {
  await txDb.transaction(async (tx) => { /* ... */ });
} catch (err) { /* ... */ } finally {
  await txCleanup(); // CR-04: always close Pool
}
```

---

### `src/db/migrations/0013_v4_chainage_backfill.sql` (NEW)

**Analog:** `src/db/migrations/0010_v4_routes_ext.sql`

**Header comment pattern** (lines 1–16 of 0010):
```sql
-- HAND-WRITTEN (WR-06): drizzle-kit generate is used as a template source, but the output
-- requires hand-verification and editing per established project precedent (see 0005, 0007, 0009).
-- Key hand-edits applied: ...
-- WARNING: Do NOT re-run drizzle-kit generate over this file ...
-- Apply only via `npx tsx src/db/migrate.ts` (D-49).
-- Note: statement-breakpoint separators (-- > statement-breakpoint) are MANDATORY — neon-http cannot execute multiple
--       DDL statements in a single prepared call (T-14-MULTISTMT mitigation, D-07-02 precedent).
```

**Migration 0013 is DML (UPDATE), not DDL — single statement, no `-- > statement-breakpoint` needed.**
Format: follow the header comment discipline from 0010. Must be registered in `src/db/migrations/meta/` journal (same process as 0010–0012).

**Apply command pattern** (from RESEARCH.md):
```bash
npx tsx src/db/migrate.ts                                      # dev branch (DATABASE_URL)
DATABASE_URL=$DATABASE_URL_TEST npx tsx src/db/migrate.ts      # test branch
```

---

### `src/actions/chainage.ts` (NEW) — `getChainageBuckets` + `setChainageOffset`

**Analog:** `src/actions/analytics.ts` (auth-guard + tenant-scope + `db.execute(sql\`...\`)` pattern)

**File header + 'use server' + imports pattern** (analytics.ts lines 1–32):
```typescript
'use server';

import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { auth } from '@/lib/auth';
import { getDefaultTenantId } from '@/lib/tenant';
```

**Auth-guard + tenant-scope pattern** (analytics.ts lines 188–193 — `getCanonicalSubmissions`):
```typescript
export async function getChainageBuckets(/* ... */) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();
  // ...
}
```

**`db.execute(sql\`...\`)` with bound params** (analytics.ts lines 227–267):
```typescript
const result = await db.execute(sql`
  SELECT
    s.id,
    ...
  FROM submissions s
  JOIN projects p ON p.id = s.project_id
  WHERE ${whereClause}
  ORDER BY s.submitted_at DESC
  LIMIT ${limitVal} OFFSET ${offsetVal}
`);
return result.rows.map((r) => ({ ... }));
```

**`sql.join` for parameterized WHERE fragment** (analytics.ts lines 197–220):
```typescript
const conditions = [sql`s.tenant_id = ${tenantId}`];
if (filters.projectIds && filters.projectIds.length > 0) {
  conditions.push(sql`s.project_id = ANY(${filters.projectIds})`);
}
const whereClause = sql.join(conditions, sql` AND `);
```

**`setChainageOffset` pattern** — copy from `src/actions/routes.ts` lines 46–99 (`uploadRoute`):
```typescript
// routes.ts lines 46–55 — auth + ownership check pattern
export async function uploadRoute(projectId: string, fileContent: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // CR-02: Verify project belongs to the active tenant before writing (IDOR mitigation).
  const owned = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, getDefaultTenantId())))
    .limit(1);
  if (!owned.length) throw new Error('Not found');
  // ...
}
```

**logOfficeActivity + revalidatePath** (routes.ts lines 86–98):
```typescript
  if (session.user?.id) {
    logOfficeActivity({
      actorUserId: session.user.id,
      actionType: 'route_uploaded',
      entityType: 'project',
      entityId: projectId,
      projectId,
      metadata: { coordinateCount: result.count },
    });
  }
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true as const, ... };
```

**Important for `getChainageBuckets` shared data helper:**
The Route Handler at `/api/exports/chainage` cannot call the `'use server'` function directly (Pitfall 6 in RESEARCH.md). Extract the raw DB query into a non-server-action helper (e.g. `fetchChainageBucketsRaw(projectId, bucketSizeM, tenantId)`) that takes `tenantId` as an explicit param. Both the Server Action wrapper and the Route Handler call this helper.

**Result row mapping pattern** (analytics.ts lines 269–298):
```typescript
return result.rows.map((r) => ({
  id: String(r.id),
  projectId: String(r.project_id),
  // numeric string fields — string to avoid float drift
  quantity: String(r.quantity),
  // nullable fields
  auditorName: r.auditor_name != null ? String(r.auditor_name) : null,
  // date fields
  submittedAt: r.submitted_at instanceof Date
    ? r.submitted_at.toISOString()
    : String(r.submitted_at),
}));
```

---

### `src/lib/format-chainage.ts` (NEW)

**Analog:** Inline pure utility — no imports, no dependencies. Pattern mirrors `src/lib/spatial.ts` → `formatDistance` (pure function, no side effects).

**Complete implementation** (from 15-UI-SPEC.md §Copywriting Contract — verbatim, verified):
```typescript
// src/lib/format-chainage.ts
// Pure utility — no imports. Safe to import from RSC, client component, PDF helper, Telegram path.

export function formatChainage(m: number): string {
  const km = Math.floor(m / 1000);
  const remainder = Math.round(m % 1000).toString().padStart(3, '0');
  return `km ${km}+${remainder}`;
}

// Examples (use in tests):
// formatChainage(0)     → "km 0+000"
// formatChainage(500)   → "km 0+500"
// formatChainage(1000)  → "km 1+000"
// formatChainage(2347)  → "km 2+347"
// formatChainage(12480) → "km 12+480"
```

---

### `src/lib/pdf/chainage-pdf.tsx` (NEW)

**Analog:** `src/lib/pdf/hakedis-pdf.tsx` — read before authoring. Copy byte-for-byte structure.

**Imports pattern** (hakedis-pdf.tsx lines 24–26):
```typescript
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { PeriodHeader, PeriodLine, PeriodDeductions } from '@/actions/hakedis';
// → For chainage-pdf.tsx: import type { ChainageBucket } from '@/actions/chainage';
```

**NO 'use client' directive** (hakedis-pdf.tsx line 22 comment):
```
// NOTE: NO 'use client' directive. react-pdf components are NOT React DOM — they are
// rendered server-side to a binary buffer via renderToBuffer.
```

**StyleSheet pattern** (hakedis-pdf.tsx lines 27–62):
```typescript
const styles = StyleSheet.create({
  page: { fontFamily: 'DejaVuSans', fontSize: 9, padding: 32 },
  header: { marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#999999', paddingBottom: 8 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  headerMeta: { fontSize: 9, color: '#555555' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#cccccc', paddingVertical: 4 },
  tableHeader: { fontWeight: 'bold', backgroundColor: '#f5f5f5' },
  colNumeric: { flex: 1.5, textAlign: 'right' },
  // ...
});
```

**Document + Page + View structure** (hakedis-pdf.tsx lines 72–141):
```typescript
export function HakedisPdf({ data }: { data: HakedisPdfData }) {
  return (
    <Document title={...} author="bayrak.ai" creationDate={data.generatedAt}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>...</Text>
          <Text style={styles.headerMeta}>...</Text>
        </View>
        {/* table header row */}
        <View style={[styles.tableRow, styles.tableHeader]}>
          <Text style={styles.colMaterial}>...</Text>
          ...
        </View>
        {/* table body rows */}
        {data.lines.map((line) => (
          <View key={line.id} style={styles.tableRow}>
            ...
          </View>
        ))}
      </Page>
    </Document>
  );
}
```

**renderToBuffer wrapper pattern** (hakedis-pdf.tsx lines 150–152):
```typescript
export async function renderHakedisPdf(data: HakedisPdfData): Promise<Buffer> {
  return renderToBuffer(<HakedisPdf data={data} />);
}
// → For chainage: export async function renderChainagePdf(data: ChainagePdfData): Promise<Buffer>
```

**DejaVu font registration:** The fonts are registered in the hakedis route handler — copy that `registerFonts()` call into the chainage PDF module (or a shared font-registration module if one exists). Check where `registerFonts()` is called in the Phase 11 hakedis export route before authoring.

---

### `src/components/dashboard/ChainageTab.tsx` (NEW, RSC)

**Analog:** `src/components/dashboard/RouteTab.tsx` — exact structural match (RSC data-shell, Promise.all, pass to client component).

**RSC shell pattern** (RouteTab.tsx lines 30–83):
```typescript
import { getTranslations } from 'next-intl/server';
// ... import actions and client component

export async function RouteTab({ projectId }: RouteTabProps) {
  const t = await getTranslations('dashboard.route');

  const [existingRoute, routeGeoJSONResult, approvedPoints, boqLegend, sourceDocuments] =
    await Promise.all([
      getRoute(projectId),
      getRouteGeoJSON(projectId),
      // ...
    ]);

  // Serialize Date → ISO string for RSC→client boundary
  const serializedRoute = existingRoute ? { ...existingRoute, uploadedAt: existingRoute.uploadedAt.toISOString() } : null;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">{t('title')}</h2>
      <RouteTabClient
        projectId={projectId}
        existingRoute={serializedRoute}
        // ...
      />
    </div>
  );
}
```

**force-dynamic** (project page.tsx line 16):
```typescript
export const dynamic = 'force-dynamic';
// → Apply this at the ChainageTab module level, not just the page
```

**KpiCard usage pattern** (src/components/admin/KpiCard.tsx lines 39–86):
```typescript
import { KpiCard } from '@/components/admin/KpiCard';
// ...
<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
  <KpiCard
    label={t('kpi_completion_label')}
    subLabel={t('kpi_completion_sublabel')}
    value={`${completionPct}%`}
    icon={<Route className="size-4" />}
    valueColor={completionPct >= 80 ? 'success' : completionPct >= 1 ? 'warning' : 'default'}
  />
  {/* ... two more KpiCards */}
</div>
```

**KpiCard props contract** (KpiCard.tsx lines 22–30):
```typescript
interface KpiCardProps {
  label: string;
  subLabel: string;
  value: number | string;
  icon: React.ReactNode;
  drillHref?: string;
  valueColor?: 'default' | 'success' | 'destructive' | 'warning';
  alertBadge?: React.ReactNode;
}
```

---

### `src/components/dashboard/ChainageTable.tsx` (NEW, client)

**Analog:** Client component peers — `RouteTabClient.tsx` for the `'use client'` + `useTransition` pattern; `KayitlarTabClient.tsx` for the BrandTable + status badge pattern.

**'use client' + import pattern** — mirror any existing `RouteTabClient.tsx` or `KayitlarTabClient.tsx`. Standard top-of-file shape:
```typescript
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BrandTable, BrandBadge, BrandButton, BrandCard, BrandEmpty } from '@/components/brand';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { formatChainage } from '@/lib/format-chainage';
import { getChainageBuckets } from '@/actions/chainage';
import type { ChainageBucket } from '@/actions/chainage';
```

**Colour bar pattern** (15-UI-SPEC.md §Chainage Colour Bar + RESEARCH.md Pattern 6 — verbatim from 15-UI-SPEC):
```tsx
<div
  className="w-full h-2 rounded-full overflow-hidden border border-slate-200 my-3"
  role="img"
  aria-label="Güzergah tamamlanma durumu"
>
  {buckets.map((bucket, i) => (
    <div
      key={i}
      style={{ width: `${(1 / totalBuckets) * 100}%` }}
      className={
        bucket.status === 'approved'    ? 'bg-emerald-400' :
        bucket.status === 'in_progress' ? 'bg-amber-300'   :
        'bg-slate-200'
      }
    />
  ))}
</div>
```

**BrandBadge status variant mapping** (from 15-UI-SPEC.md):
```typescript
// approved  → variant="success"
// in_progress → variant="primary"  (amber-50/amber-700; reads as status, not CTA due to rounded-full shape)
// not_started → variant="neutral"
```

**Export button pattern** (mirrors Phase 11 ExportsHub — `window.open` in a `'_blank'` new tab):
```tsx
<BrandButton
  variant="outline"
  size="sm"
  onClick={() => window.open(`/api/exports/chainage?projectId=${projectId}&format=xlsx&bucketSizeM=${bucketSizeM}`, '_blank')}
>
  <FileSpreadsheet className="size-4" />
  {t('export_excel')}
</BrandButton>
```

---

### `src/components/dashboard/ChainageOffsetForm.tsx` (NEW, client)

**Analog:** Any existing client form component with `useTransition` + Server Action call + `router.refresh()` on success.

**useTransition + server action pattern** (standard Next.js App Router client form):
```typescript
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setChainageOffset } from '@/actions/chainage';

export function ChainageOffsetForm({ projectId, currentOffsetM }: { projectId: string; currentOffsetM: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [offsetInput, setOffsetInput] = useState(String(currentOffsetM));
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const parsed = parseFloat(offsetInput);
    if (isNaN(parsed)) { setError('Geçersiz değer'); return; }
    startTransition(async () => {
      try {
        await setChainageOffset(projectId, parsed);
        router.refresh();
        // toast 'Kaydedildi' via sonner
      } catch {
        setError('Kayıt başarısız');
      }
    });
  }
  // ...
}
```

---

### `src/app/api/exports/chainage/route.ts` (NEW)

**Analog:** `src/app/api/exports/submissions/route.ts` — copy structure verbatim.

**Complete skeleton** (submissions/route.ts lines 38–139):
```typescript
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logOfficeActivity } from '@/lib/log-office-activity';
// [NEW] import { fetchChainageBucketsRaw } from '@/lib/chainage-data';
// [NEW] import { buildChainageLedger } from '@/lib/chainage-excel';
// [NEW] import { renderChainagePdf } from '@/lib/pdf/chainage-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const projectId = params.get('projectId') ?? '';
  const format = params.get('format') ?? 'xlsx';
  const bucketSizeM = Number(params.get('bucketSizeM') ?? '1000') || 1000;

  // [NEW] Validate bucketSizeM whitelist (V5 — only 100|500|1000 allowed)
  // ...

  // [NEW] Call shared data helper — NOT the 'use server' action directly (Pitfall 6)
  const data = await fetchChainageBucketsRaw(projectId, bucketSizeM, getDefaultTenantId());

  let buffer: Buffer;
  let contentType: string;
  let filename: string;

  if (format === 'pdf') {
    buffer = await renderChainagePdf(data);
    contentType = 'application/pdf';
    filename = `chainage-asbuilt-${projectId}.pdf`;
  } else {
    buffer = await buildChainageLedger(data);
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    filename = `chainage-asbuilt-${projectId}.xlsx`;
  }

  const response = new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  });

  // D-109 fire-and-forget activity log (never await)
  logOfficeActivity({
    actorUserId: session.user!.id!,
    actionType: 'chainage_exported',
    entityType: 'chainage_export',
    projectId,
    metadata: { format, bucketSizeM },
  });

  return response;
}
```

**Key difference from submissions route:** calls `fetchChainageBucketsRaw` (a plain async function, not a `'use server'` action) to avoid the Server-Action-from-Route-Handler restriction (RESEARCH Pitfall 6).

---

### `src/app/dashboard/projects/[id]/page.tsx` — MODIFY: add `asbuilt` tab

**Analog:** Self — lines 44–133 of the file.

**activeTab ternary extension** (page.tsx lines 44–47):
```typescript
// EXISTING:
const activeTab =
  tab === 'rota'     ? 'rota'     :
  tab === 'kayitlar' ? 'kayitlar' :
  tab === 'personel' ? 'personel' : 'boq';

// MODIFIED (add before the final : 'boq' fallback):
const activeTab =
  tab === 'rota'     ? 'rota'     :
  tab === 'kayitlar' ? 'kayitlar' :
  tab === 'personel' ? 'personel' :
  tab === 'asbuilt'  ? 'asbuilt'  : 'boq';
```

**TabsTrigger pattern** (page.tsx lines 72–92 — copy the existing pattern):
```tsx
<TabsTrigger value="asbuilt">
  <Link href={`/dashboard/projects/${id}?tab=asbuilt`} className="contents" prefetch={false}>
    {t('tab_asbuilt')}  {/* new i18n key: dashboard.projects.tab_asbuilt */}
  </Link>
</TabsTrigger>
```

**TabsContent pattern** (page.tsx lines 95–130 — copy the boq/rota pattern):
```tsx
<TabsContent value="asbuilt" className="pt-12">
  <BrandCard>
    <BrandCard.Body>
      <ChainageTab projectId={id} />
    </BrandCard.Body>
  </BrandCard>
</TabsContent>
```

**i18n translation setup** (page.tsx lines 27–31 — add new namespace):
```typescript
const t = await getTranslations('dashboard.projects');
// ChainageTab handles its own 'dashboard.asbuilt' translations internally via getTranslations
```

---

### `src/actions/analytics.ts` + `src/lib/types/canonical-submission.ts` + `src/components/admin/SubmissionDetailView.tsx` — MODIFY: Google Maps link (folded todo)

**Analog:** Self (additive extension to existing shapes).

**CanonicalSubmission type extension** (canonical-submission.ts lines 21–44 — add two fields at end):
```typescript
export type CanonicalSubmission = {
  // ... all existing fields unchanged ...
  rejectionReason: string | null;
  // [NEW Phase 15 — folded todo submission-detail-map-link]
  snappedLat: number | null;  // ST_Y(snapped_point) = latitude; null when no snapped point
  snappedLon: number | null;  // ST_X(snapped_point) = longitude; null when no snapped point
};
```

**getCanonicalSubmissions SELECT extension** (analytics.ts lines 227–266 — add to SELECT block):
```typescript
// Existing SELECT (line 229):
//   s.id,
//   s.project_id,
//   ...

// [NEW] Add after existing SELECT fields (before FROM):
//   ST_Y(s.snapped_point)                                         AS snapped_lat,
//   ST_X(s.snapped_point)                                         AS snapped_lon,

// Pitfall 5 from RESEARCH: ST_X = longitude, ST_Y = latitude (WGS84 stored lng-first via ST_MakePoint)
// Google Maps ?q=lat,lon — so snapped_lat = ST_Y, snapped_lon = ST_X
```

**Row mapping extension** (analytics.ts lines 269–298 — add two lines to return object):
```typescript
return result.rows.map((r) => ({
  // ... existing fields ...
  rejectionReason: r.rejection_reason != null ? String(r.rejection_reason) : null,
  // [NEW]:
  snappedLat: r.snapped_lat != null ? Number(r.snapped_lat) : null,
  snappedLon: r.snapped_lon != null ? Number(r.snapped_lon) : null,
}));
```

**SubmissionDetailView map link** (SubmissionDetailView.tsx — add after the existing distance `<span>` block at line 204–210):

Existing `MapPin` import already present at line 34. Add after the existing distance/warning badge inside the Location `<dd>`:
```tsx
{submission.snappedLat != null && submission.snappedLon != null && (
  <a
    href={`https://www.google.com/maps?q=${submission.snappedLat},${submission.snappedLon}`}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1 text-xs text-primary underline"
  >
    <MapPin className="size-3" aria-hidden="true" />
    {t('view_on_map')}  {/* new key: dashboard.records.view_on_map */}
  </a>
)}
```

Existing anchor + `rel="noopener noreferrer"` pattern already present at SubmissionDetailView.tsx line 122–127.

---

### `tests/chainage.test.ts` (NEW)

**Analog:** `tests/spatial.test.ts` (unit + integration mix, `describeIfDb` for DB tests, pure unit tests run always).

**Test file structure** (spatial.test.ts lines 1–50):
```typescript
/**
 * tests/chainage.test.ts
 *
 * Phase 15 chainage tests (CHN-01..CHN-06).
 * Unit tests: formatChainage, completion %, bucket boundary
 * Integration tests: snapshot write, backfill migration check (require DB)
 */

import { beforeEach, afterEach, it, expect, describe } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  describeIfDb,
  getTestDb,
  truncateAllTables,
} from './fixtures/db';
import { formatChainage } from '../src/lib/format-chainage';

// Pure unit tests (no DB required — always run)
describe('formatChainage (CHN-01)', () => {
  it('formats 0 as km 0+000', () => expect(formatChainage(0)).toBe('km 0+000'));
  it('formats 500 as km 0+500', () => expect(formatChainage(500)).toBe('km 0+500'));
  it('formats 1000 as km 1+000', () => expect(formatChainage(1000)).toBe('km 1+000'));
  it('formats 2347 as km 2+347', () => expect(formatChainage(2347)).toBe('km 2+347'));
  it('formats 12480 as km 12+480', () => expect(formatChainage(12480)).toBe('km 12+480'));
});

// Integration tests (gated)
describeIfDb('chainage snapshot + bucket aggregation (CHN-03, CHN-04)', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  beforeEach(async () => { db = await getTestDb(); await truncateAllTables(db); /* seed */ });
  afterEach(async () => { await truncateAllTables(db); });

  it('chainage_m written at approval (CHN-03)', async () => { /* ... */ });
  it('bucket boundary: exact 1000.0 m lands in bucket index 1 not 0', async () => { /* ... */ });
  // ...
});
```

**describeIfDb pattern** (postgis.test.ts line 19):
```typescript
describeIfDb('PostGIS extension + coordinate order (SETUP-03 / D-10)', () => { ... });
// → import { describeIfDb } from './fixtures/db';
```

**Fixture seed pattern** (postgis.test.ts lines 26–45 — seed tenant + project in beforeEach):
```typescript
await db.execute(sql.raw(`
  INSERT INTO tenants (id, name)
  VALUES ('00000000-0000-0000-0000-000000000001', 'Test Tenant')
  ON CONFLICT DO NOTHING
`));
await db.execute(sql.raw(`
  INSERT INTO projects (id, tenant_id, name)
  VALUES ('00000000-0000-0000-0000-000000000002', '...', 'Test Project')
  ON CONFLICT DO NOTHING
`));
```

---

## Shared Patterns

### Authentication Guard
**Source:** `src/actions/analytics.ts` lines 188–193 / `src/actions/routes.ts` lines 46–49
**Apply to:** `src/actions/chainage.ts` (`getChainageBuckets`, `setChainageOffset`) and `src/app/api/exports/chainage/route.ts`
```typescript
const session = await auth();
if (!session) throw new Error('Unauthorized');  // Server Actions
// Route Handler variant:
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

### Tenant Scope
**Source:** `src/actions/analytics.ts` line 193 / `src/actions/routes.ts` line 55
**Apply to:** ALL new queries in `src/actions/chainage.ts` and the shared data helper
```typescript
const tenantId = getDefaultTenantId();
// Every WHERE clause: AND s.tenant_id = ${tenantId}  (or r.tenant_id)
```

### Drizzle sql`` Template for Postgres Arithmetic
**Source:** `src/lib/bot-audit.ts` line 447
**Apply to:** chainage snapshot write (ROUND), getChainageBuckets FLOOR/COALESCE expressions
```typescript
sql2`approved_qty + ${affected[0].quantity}`
// → For chainage:
sql2`ROUND(${affected[0].segmentFraction}::numeric * ${routeRow.totalLengthM}::numeric, 2)`
```

### Binary Response Pattern
**Source:** `src/app/api/exports/submissions/route.ts` lines 114–122
**Apply to:** `src/app/api/exports/chainage/route.ts`
```typescript
const response = new NextResponse(new Uint8Array(buffer), {
  status: 200,
  headers: {
    'Content-Type': '...',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': String(buffer.length),
  },
});
```

### runtime + dynamic for Export Route Handlers
**Source:** `src/app/api/exports/submissions/route.ts` lines 46–47
**Apply to:** `src/app/api/exports/chainage/route.ts`
```typescript
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
```

### logOfficeActivity Fire-and-Forget
**Source:** `src/app/api/exports/submissions/route.ts` lines 124–136
**Apply to:** `src/app/api/exports/chainage/route.ts`
```typescript
// Never awaited — fire and forget (D-109)
logOfficeActivity({
  actorUserId: session.user!.id!,
  actionType: 'chainage_exported',
  entityType: 'chainage_export',
  projectId,
  metadata: { format, bucketSizeM },
});
```

### RSC → Client Date Serialization
**Source:** `src/components/dashboard/RouteTab.tsx` lines 52–65
**Apply to:** `src/components/dashboard/ChainageTab.tsx` (any Date fields from `getRoute`)
```typescript
const serializedRoute = existingRoute ? {
  ...existingRoute,
  uploadedAt: existingRoute.uploadedAt instanceof Date
    ? existingRoute.uploadedAt.toISOString()
    : String(existingRoute.uploadedAt),
} : null;
```

### Migration Header + Apply Command
**Source:** `src/db/migrations/0010_v4_routes_ext.sql` lines 1–16
**Apply to:** `src/db/migrations/0013_v4_chainage_backfill.sql`

The `-- > statement-breakpoint` comment is ONLY needed between multiple DDL/DML statements. Migration 0013 has a single UPDATE — no separator needed, but document it in the header for future editors.

---

## No Analog Found

All files have analogs. No file requires falling back to RESEARCH.md patterns only.

---

## Metadata

**Analog search scope:** `src/lib/`, `src/actions/`, `src/app/api/exports/`, `src/app/dashboard/projects/`, `src/components/admin/`, `src/components/dashboard/`, `src/db/migrations/`, `tests/`
**Files read for extraction:** 13 source files
**Pattern extraction date:** 2026-05-30
