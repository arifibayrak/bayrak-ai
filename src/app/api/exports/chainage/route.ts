/**
 * src/app/api/exports/chainage/route.ts
 *
 * GET /api/exports/chainage — CHN-07 as-built chainage Excel + PDF export.
 *
 * Query string:
 *   projectId    UUID     — project to export
 *   format?      xlsx|pdf — default xlsx
 *   bucketSizeM? 100|500|1000 — bucket width in metres; default 1000
 *
 * Security (T-15-06-AUTH / CHN-07 SC):
 *   - auth() is the FIRST statement; null session → 401 JSON (NOT redirect —
 *     binary endpoint). Does NOT inherit layout auth.
 *   - Tenant scope enforced inside fetchChainageBucketsRaw via explicit tenantId.
 *   - bucketSizeM whitelist-coerced to {100,500,1000} (T-15-06-SQLI).
 *
 * Pitfall 6 (15-RESEARCH): Route Handlers cannot call 'use server' actions.
 *   This handler calls fetchChainageBucketsRaw (plain async helper), NOT the
 *   getChainageBuckets Server Action.
 *
 * D-109: fires chainage_exported activity log (fire-and-forget, never await).
 * runtime='nodejs' + dynamic='force-dynamic': ExcelJS + @react-pdf/renderer are
 *   Node-only; exports must never be cached.
 *
 * Threat model:
 *   T-15-06-AUTH    mitigated (auth-first, 401 JSON)
 *   T-15-06-FORMULA mitigated (sanitizeExcelCell in buildChainageLedger)
 *   T-15-06-IDOR    mitigated (tenant scope via fetchChainageBucketsRaw)
 *   T-15-06-SQLI    mitigated (bucketSizeM whitelist coercion)
 *   T-15-06-SA      mitigated (calls shared helper, not Server Action)
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { fetchChainageBucketsRaw } from '@/lib/chainage-data';
import { buildChainageLedger } from '@/lib/chainage-excel';
import { renderChainagePdf } from '@/lib/pdf/chainage-pdf';
import { registerFonts } from '@/lib/pdf/fonts';
import { logOfficeActivity } from '@/lib/log-office-activity';
import { getDefaultTenantId } from '@/lib/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// T-15-06-SQLI: only these values are accepted for bucketSizeM
const VALID_BUCKET_SIZES = new Set([100, 500, 1000]);

export async function GET(request: Request) {
  // T-15-06-AUTH: auth() FIRST — 401 JSON on no session (not redirect)
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse query string ──────────────────────────────────────────────────
  const params = new URL(request.url).searchParams;
  const projectId  = params.get('projectId') ?? '';
  const format     = params.get('format') ?? 'xlsx';
  const bucketSizeRaw = Number(params.get('bucketSizeM') ?? '1000') || 1000;

  // T-15-06-SQLI: whitelist-coerce bucketSizeM to {100, 500, 1000}
  const bucketSizeM = VALID_BUCKET_SIZES.has(bucketSizeRaw) ? bucketSizeRaw : 1000;

  // ── Fetch data via shared helper (Pitfall 6 — NOT the Server Action) ───
  const data = await fetchChainageBucketsRaw(
    projectId,
    bucketSizeM,
    getDefaultTenantId(),
  );

  // ── Build buffer ────────────────────────────────────────────────────────
  let buffer: Buffer;
  let contentType: string;
  let filename: string;

  if (format === 'pdf') {
    registerFonts(); // D-106: must run before renderChainagePdf
    buffer = await renderChainagePdf({
      buckets: data.buckets,
      projectId,
      generatedAt: new Date(),
    });
    contentType = 'application/pdf';
    filename = `chainage-asbuilt-${projectId}.pdf`;
  } else {
    buffer = await buildChainageLedger({ buckets: data.buckets, projectId });
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    filename = `chainage-asbuilt-${projectId}.xlsx`;
  }

  // ── Construct response ──────────────────────────────────────────────────
  const response = new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  });

  // ── D-109 activity log (fire-and-forget — never await) ──────────────────
  logOfficeActivity({
    actorUserId: session.user!.id!,
    actionType: 'chainage_exported',
    entityType: 'chainage_export',
    projectId: projectId || undefined,
    metadata: { format, bucketSizeM },
  });

  return response;
}
