/**
 * src/app/api/exports/hakedis/[periodId]/route.ts
 *
 * GET /api/exports/hakedis/[periodId] — EXP-02 hakkediş Excel export.
 *
 * Streams a 3-sheet ExcelJS workbook (Yeşil Defter / Fiyat İcmali / Hesap Özeti
 * per D-115) for one finalized hakkediş period. Reads ONLY snapshot fields from
 * getPeriodDetail (D-107) — never touches live BOQ data. Deductions are already
 * computed in Postgres numeric (D-90) and flow direct into Hesap Özeti cells
 * with no parseFloat / Number() coercion (D-116 + Pitfall 2).
 *
 * Security (D-114 / SC5):
 *   - auth() is the FIRST statement; null session → 401 JSON (NOT redirect —
 *     binary endpoint).
 *   - getPeriodDetail is tenant-scoped (T-11-04-IDOR mitigation); cross-tenant
 *     access throws 'Period not found' → 404 with no info leak.
 *   - Draft guard (Pitfall 5): server-side 422 on status === 'draft'.
 *     PeriodDetailControls hides the button client-side, but server enforces.
 *
 * Pitfall 6: runtime='nodejs' + dynamic='force-dynamic' (ExcelJS is Node-only).
 *
 * D-109: fires hakedis_excel_exported activity log via logOfficeActivity.
 * D-112: filename pattern hakkedis-{periodNumber}-{projectSlug}.xlsx (no date).
 *
 * Threat model:
 *   T-11-04-AUTH       mitigated (auth-first)
 *   T-11-04-IDOR       mitigated (getPeriodDetail tenant scope; UUID pre-validation)
 *   T-11-04-DRAFT      mitigated (status === 'draft' → 422)
 *   T-11-04-FLOAT      mitigated (D-107 + D-116 — strings flow direct)
 *   T-11-04-FILENAME   mitigated (toSlug ASCII normalization)
 *   T-11-04-FORMULA    mitigated (sanitizeExcelCell in buildHakedisExcel)
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPeriodDetail } from '@/actions/hakedis';
import { getProjects } from '@/actions/projects';
import { buildHakedisExcel } from '@/lib/excel';
import { logOfficeActivity } from '@/lib/log-office-activity';
import { toSlug } from '@/lib/slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ periodId: string }> },
) {
  // D-114: auth guard FIRST statement
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { periodId } = await params;
  if (!UUID_RE.test(periodId)) {
    return NextResponse.json({ error: 'Invalid period id' }, { status: 400 });
  }

  // Tenant-scoped fetch. 'Period not found' covers both missing IDs and
  // cross-tenant probes (T-11-04-IDOR) — both return 404 with no info leak.
  let detail: Awaited<ReturnType<typeof getPeriodDetail>>;
  try {
    detail = await getPeriodDetail(periodId);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Pitfall 5: draft guard — defense in depth. PeriodDetailControls hides
  // the export button for draft periods; server enforces as source of truth.
  if (detail.period.status === 'draft') {
    return NextResponse.json({ error: 'Period is not finalized' }, { status: 422 });
  }
  if (detail.deductions === null) {
    return NextResponse.json({ error: 'Period has no priced lines' }, { status: 422 });
  }

  // Look up the project name for the filename slug. PortfolioPeople has it as
  // a free field, but getPeriodDetail returns only the projectId. getProjects
  // is tenant-scoped (auth() inside it).
  const projects = await getProjects();
  const project = projects.find((p) => p.id === detail.period.projectId);
  const projectName = project?.name ?? detail.period.projectId;
  let slug = toSlug(projectName);
  if (!slug) slug = 'project';

  const filename = `hakkedis-${detail.period.periodNumber}-${slug}.xlsx`;

  const buffer = await buildHakedisExcel({
    period: detail.period,
    lines: detail.lines,
    deductions: detail.deductions,
    projectName,
  });

  const response = new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  });

  // D-109 activity log — fire-and-forget via after()
  logOfficeActivity({
    actorUserId: session.user!.id!,
    actionType: 'hakedis_excel_exported',
    entityType: 'hakedis_period',
    entityId: detail.period.id,
    projectId: detail.period.projectId,
    metadata: {
      periodNumber: detail.period.periodNumber,
      filename,
    },
  });

  return response;
}
