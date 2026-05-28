/**
 * src/app/api/exports/performance/route.ts
 *
 * GET /api/exports/performance — EXP-03 performance summary Excel export.
 *
 * Workbook layout (D-110 — Office Engineers EXCLUDED):
 *   Sheet 1: 'Workers - Personel'    — per-worker KPIs from getPortfolioPeople({role:'worker'})
 *   Sheet 2: 'Auditors - Denetçiler' — per-auditor KPIs from getPortfolioPeople({role:'auditor'})
 *
 * Query string:
 *   from?    ISO date — lower bound for submitted_at (must come WITH to)
 *   to?      ISO date — upper bound (must come WITH from)
 *   project? UUID     — single project filter
 *
 * Security (D-114 / SC5):
 *   - `auth()` is the FIRST statement; null session → 401 JSON (NOT redirect —
 *     binary endpoint).
 *   - Tenant scope enforced inside getPortfolioPeople (analytics.ts line ~1111
 *     via getDefaultTenantId() + WHERE p.tenant_id = tenantId).
 *
 * Pitfall 6 — runtime='nodejs' + dynamic='force-dynamic' mandatory:
 *   ExcelJS is Node-only; exports must never be cached.
 *
 * D-109 — every successful export writes exactly one office_activity_log row of
 * action_type 'performance_summary_exported' via logOfficeActivity (fire-and-forget).
 *
 * D-110 — workbook has EXACTLY two sheets; Office Engineers are NOT included.
 *   Enforced by buildPerformanceSummary (no OE data is ever fetched by this route).
 *
 * D-112 — filename pattern:
 *   performance-{projectSlug or 'portfolio'}-{fromYYYYMMDD or 'all'}-{toYYYYMMDD or 'all'}.xlsx
 *
 * Threat model:
 *   T-11-03-AUTH         mitigated (auth-first)
 *   T-11-03-IDOR         mitigated (tenant scope via getPortfolioPeople)
 *   T-11-03-FLOAT        mitigated (D-116 in buildPerformanceSummary — no parseFloat)
 *   T-11-03-FILENAME     mitigated (toSlug ASCII normalization)
 *   T-11-03-OE-LEAK      mitigated (D-110 — 2 sheets only; no OE data fetched)
 *   T-11-03-FORMULA      mitigated (sanitizeExcelCell in buildPerformanceSummary)
 *   T-11-03-LOCATION-LEAK mitigated (PortfolioWorker.locationComplianceRate
 *                                    inherits getPortfolioPeople's tenant scope)
 *   T-11-03-DOS          accepted (bounded single-tenant portfolio)
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortfolioPeople } from '@/actions/analytics';
import { getProjects } from '@/actions/projects';
import { buildPerformanceSummary } from '@/lib/excel';
import { logOfficeActivity } from '@/lib/log-office-activity';
import { toSlug } from '@/lib/slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse query string ──────────────────────────────────────────────────
  const params = new URL(request.url).searchParams;
  const from = params.get('from');
  const to = params.get('to');
  const project = params.get('project');

  // getPortfolioPeople's dateRange is { from, to } — both required together.
  // Reject partial date filters with 400 so the caller knows it's incomplete.
  if ((from && !to) || (to && !from)) {
    return NextResponse.json(
      { error: 'Both from and to are required when supplying a date range' },
      { status: 400 },
    );
  }

  let dateRange: { from: Date; to: Date } | undefined;
  if (from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
    }
    dateRange = { from: fromDate, to: toDate };
  }

  const projectIds = project ? [project] : undefined;

  // ── Fetch workers + auditors in parallel (D-110 + performance gate) ─────
  const [workers, auditors] = await Promise.all([
    getPortfolioPeople({ role: 'worker', dateRange, projectIds }),
    getPortfolioPeople({ role: 'auditor', dateRange, projectIds }),
  ]);

  // ── Derive project name for slug (D-112) ────────────────────────────────
  // getPortfolioPeople results do NOT carry projectName — look it up directly.
  let projectName: string | undefined;
  if (project) {
    try {
      const allProjects = await getProjects();
      projectName = allProjects.find((p) => p.id === project)?.name ?? project;
    } catch {
      projectName = project;
    }
  }

  // ── Build filename per D-112 ────────────────────────────────────────────
  let slug = projectName ? toSlug(projectName) : 'portfolio';
  if (!slug) slug = 'portfolio';
  const fromStr = dateRange
    ? dateRange.from.toISOString().slice(0, 10).replace(/-/g, '')
    : 'all';
  const toStr = dateRange
    ? dateRange.to.toISOString().slice(0, 10).replace(/-/g, '')
    : 'all';
  const filename = `performance-${slug}-${fromStr}-${toStr}.xlsx`;

  // ── Build workbook buffer ───────────────────────────────────────────────
  const buffer = await buildPerformanceSummary({ workers, auditors });

  // ── Construct response ──────────────────────────────────────────────────
  const response = new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  });

  // ── D-109 activity log (fire-and-forget — never await) ──────────────────
  logOfficeActivity({
    actorUserId: session.user!.id!,
    actionType: 'performance_summary_exported',
    entityType: 'performance_summary',
    projectId: project ?? undefined,
    metadata: {
      from: from ?? null,
      to: to ?? null,
      projectId: project ?? null,
      workerCount: workers.length,
      auditorCount: auditors.length,
      filename,
    },
  });

  return response;
}
