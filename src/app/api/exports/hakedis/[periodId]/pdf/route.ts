/**
 * src/app/api/exports/hakedis/[periodId]/pdf/route.ts
 *
 * GET /api/exports/hakedis/[periodId]/pdf — EXP-04 hakkediş PDF export.
 *
 * Streams an A4 hakkediş certificate (D-105 — @react-pdf/renderer) for one
 * finalized hakkediş period. Reads ONLY snapshot fields from getPeriodDetail
 * (D-107) — the rendered HakedisPdf component imports no live BOQ types.
 *
 * Font (D-106): DejaVu Sans + Bold registered at module scope via registerFonts()
 * BEFORE the first renderHakedisPdf call so the TTF parse is amortised across
 * warm Vercel-function invocations. Turkish glyphs (ğ ş ı ö ü ç) render
 * correctly without tofu/missing-glyph rectangles.
 *
 * Security (D-114 / SC5):
 *   - auth() is the FIRST statement; null session → 401 JSON.
 *   - getPeriodDetail is tenant-scoped; 404 on cross-tenant / missing.
 *   - Draft guard (Pitfall 5): server-side 422 on status === 'draft'.
 *
 * Pitfall 1 + Pitfall 6: runtime='nodejs' + dynamic='force-dynamic'. @react-pdf
 * is auto-externalized by Next.js 15 (Research A1) — no next.config change.
 *
 * D-105: renderToBuffer (via renderHakedisPdf helper) returns a Node Buffer;
 * wrapped in Uint8Array for NextResponse body (BodyInit compatibility — same
 * Phase 1 pitfall as Excel). The JSX wrapping lives in src/lib/pdf/hakedis-pdf.tsx
 * so this file stays pure-TypeScript (route.ts).
 *
 * D-109: fires hakedis_pdf_exported activity log.
 * D-112: filename hakkedis-{periodNumber}-{projectSlug}-{YYYYMMDD}.pdf
 *        YYYYMMDD = generation date (not period end).
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPeriodDetail } from '@/actions/hakedis';
import { getProjects } from '@/actions/projects';
import { logOfficeActivity } from '@/lib/log-office-activity';
import { toSlug } from '@/lib/slug';
import { registerFonts } from '@/lib/pdf/fonts';
import { renderHakedisPdf } from '@/lib/pdf/hakedis-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// D-106: call once at module scope so the TTF parse is cached across warm
// invocations on the same Vercel instance. The 'registered' flag in fonts.ts
// makes this a no-op on subsequent imports.
registerFonts();

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

  let detail: Awaited<ReturnType<typeof getPeriodDetail>>;
  try {
    detail = await getPeriodDetail(periodId);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Pitfall 5: draft guard — defense in depth.
  if (detail.period.status === 'draft') {
    return NextResponse.json({ error: 'Period is not finalized' }, { status: 422 });
  }
  if (detail.deductions === null) {
    return NextResponse.json({ error: 'Period has no priced lines' }, { status: 422 });
  }

  const projects = await getProjects();
  const project = projects.find((p) => p.id === detail.period.projectId);
  const projectName = project?.name ?? detail.period.projectId;
  let slug = toSlug(projectName);
  if (!slug) slug = 'project';

  // D-112: YYYYMMDD is the generation date (NOT periodEndDate)
  const now = new Date();
  const yyyymmdd =
    `${now.getFullYear()}` +
    `${String(now.getMonth() + 1).padStart(2, '0')}` +
    `${String(now.getDate()).padStart(2, '0')}`;
  const filename = `hakkedis-${detail.period.periodNumber}-${slug}-${yyyymmdd}.pdf`;

  // D-105: renderHakedisPdf wraps the JSX + renderToBuffer in src/lib/pdf/
  const buffer = await renderHakedisPdf({
    period: detail.period,
    lines: detail.lines,
    deductions: detail.deductions,
    projectName,
    generatedAt: now,
  });

  const response = new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  });

  // D-109 activity log — fire-and-forget via after()
  logOfficeActivity({
    actorUserId: session.user!.id!,
    actionType: 'hakedis_pdf_exported',
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
