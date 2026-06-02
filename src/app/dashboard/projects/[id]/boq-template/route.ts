/**
 * src/app/dashboard/projects/[id]/boq-template/route.ts
 *
 * GET /dashboard/projects/[id]/boq-template
 *
 * Returns a downloadable .xlsx BOQ template (D-05).
 * Auth-guarded — redirects to sign-in for unauthenticated requests (T-06-04).
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sessionRole } from '@/lib/rbac';
import { canWrite } from '@/lib/authz';
import { generateBoqTemplate } from '@/lib/excel';

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // RBAC: BOQ template download is part of the office write workflow; audit_engineer is read-only.
  if (!canWrite(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const buffer = await generateBoqTemplate();

  // NextResponse requires BodyInit — convert Buffer to Uint8Array for compatibility
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="boq-template.xlsx"',
      'Content-Length': String(buffer.length),
    },
  });
}
