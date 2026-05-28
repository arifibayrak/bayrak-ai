/**
 * src/app/api/exports/submissions/route.ts
 *
 * GET /api/exports/submissions — EXP-01 submission ledger Excel export.
 *
 * Query string:
 *   from?    ISO date — lower bound for submitted_at
 *   to?      ISO date — upper bound for submitted_at
 *   project? UUID     — single project filter (spread into projectIds)
 *
 * Security (D-114 / SC5):
 *   - `auth()` is the FIRST statement; null session → 401 JSON (NOT redirect —
 *     binary endpoint).
 *   - Tenant scope is enforced inside getCanonicalSubmissions via getDefaultTenantId.
 *
 * Pitfall 3 — explicit `limit: 100_000` overrides the action's default 1000
 * which would silently truncate large ledgers.
 *
 * Pitfall 6 — runtime='nodejs' + dynamic='force-dynamic' are mandatory:
 *   ExcelJS is a Node-only library, and exports must never be cached.
 *
 * D-109 — every successful export writes exactly one office_activity_log row of
 * action_type 'submission_ledger_exported' via logOfficeActivity (fire-and-forget).
 *
 * D-112 — filename pattern:
 *   submission-ledger-{projectSlug or 'portfolio'}-{fromYYYYMMDD or 'all'}-{toYYYYMMDD or 'all'}.xlsx
 *
 * Threat model:
 *   T-11-02-AUTH       mitigated (auth-first)
 *   T-11-02-IDOR       mitigated (tenant scope via getCanonicalSubmissions)
 *   T-11-02-INJ        mitigated (bound parameters inside the action)
 *   T-11-02-FLOAT      mitigated (D-116 in buildSubmissionLedger)
 *   T-11-02-FILENAME   mitigated (toSlug ASCII normalization)
 *   T-11-02-FORMULA    mitigated (sanitizeExcelCell in buildSubmissionLedger)
 *   T-11-02-DOS        accepted (limit: 100_000; bounded single-tenant dataset)
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCanonicalSubmissions } from '@/actions/analytics';
import { getProjects } from '@/actions/projects';
import { buildSubmissionLedger } from '@/lib/excel';
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

  let fromDate: Date | undefined;
  let toDate: Date | undefined;

  if (from) {
    const d = new Date(from);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
    }
    fromDate = d;
  }
  if (to) {
    const d = new Date(to);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
    }
    toDate = d;
  }

  // ── Fetch canonical submissions ─────────────────────────────────────────
  // Pitfall 3: default limit is 1000 which silently truncates; force a high explicit ceiling.
  const rows = await getCanonicalSubmissions({
    from: fromDate,
    to: toDate,
    projectIds: project ? [project] : undefined,
    limit: 100_000,
  });

  // ── Derive project name for slug (D-112) ────────────────────────────────
  let projectName: string | undefined;
  if (project) {
    projectName = rows[0]?.projectName;
    if (!projectName) {
      // Fallback: rows empty but project filter active — look up via projects list
      try {
        const allProjects = await getProjects();
        projectName = allProjects.find((p) => p.id === project)?.name ?? project;
      } catch {
        projectName = project;
      }
    }
  }

  // ── Build filename per D-112 ────────────────────────────────────────────
  let slug = projectName ? toSlug(projectName) : 'portfolio';
  if (!slug) slug = 'portfolio';
  const fromStr = fromDate ? fromDate.toISOString().slice(0, 10).replace(/-/g, '') : 'all';
  const toStr = toDate ? toDate.toISOString().slice(0, 10).replace(/-/g, '') : 'all';
  const filename = `submission-ledger-${slug}-${fromStr}-${toStr}.xlsx`;

  // ── Build workbook buffer ───────────────────────────────────────────────
  const buffer = await buildSubmissionLedger(rows);

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
    actionType: 'submission_ledger_exported',
    entityType: 'submission_ledger',
    projectId: project ?? undefined,
    metadata: {
      from: from ?? null,
      to: to ?? null,
      rowCount: rows.length,
      filename,
    },
  });

  return response;
}
