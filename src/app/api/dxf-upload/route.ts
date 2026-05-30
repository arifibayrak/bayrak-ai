/**
 * src/app/api/dxf-upload/route.ts
 *
 * Vercel Blob client-upload token exchange route (RTE-03).
 * The browser calls this endpoint to get an auth-checked token before
 * directly uploading the DXF file to Vercel Blob. The actual file bytes
 * never pass through the Next.js bodyParser (bypasses the 4.5 MB limit).
 *
 * Security (T-14-BLOB): onBeforeGenerateToken calls auth() and throws if no
 * session — unauthenticated PUT to Vercel Blob is impossible.
 * Security (T-14-DOS): maximumSizeInBytes capped at 50 MB.
 *
 * NOTE: onUploadCompleted does NOT fire in local dev without a ngrok tunnel.
 * All DB writes are performed in the uploadDxf Server Action (called AFTER
 * the client upload() call returns the blob URL). Do NOT wire any DB writes
 * to onUploadCompleted — RESEARCH Pitfall 3.
 */

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname) => {
        // Auth gate (T-14-BLOB): throw if no session — unauth PUT impossible
        const session = await auth();
        if (!session) throw new Error('Not authenticated');

        return {
          allowedContentTypes: ['application/octet-stream', 'application/dxf'],
          addRandomSuffix: true,
          // 50 MB cap (T-14-DOS — consistent with UI-SPEC error_dxf_too_large)
          maximumSizeInBytes: 50 * 1024 * 1024,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // Fires only in production (not local dev without ngrok — RESEARCH Pitfall 3).
        // DB write is in uploadDxf Server Action, not here.
        console.log('[dxf-upload] blob upload complete:', blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
