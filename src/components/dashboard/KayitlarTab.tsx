/**
 * KayitlarTab.tsx
 *
 * Submissions list tab — Server Component.
 * Reads searchParams.status / searchParams.page, calls getSubmissions,
 * and delegates to KayitlarTabClient.
 *
 * D-53, D-54, D-55: shadcn Table, filter chips, pagination, URL-state survival.
 *
 * Security (T-05-IV):
 *   - Invalid ?status= values are caught here and fall back to 'all' so the page
 *     does not crash (getSubmissions throws on invalid status strings).
 *   - ?page= is coerced to a positive integer before the fetch.
 */

import { getSubmissions } from '@/actions/submissions';
import { KayitlarTabClient } from './KayitlarTabClient';

const VALID_STATUSES = ['all', 'pending_audit', 'approved', 'rejected'] as const;

interface KayitlarTabProps {
  projectId: string;
  searchParams: { status?: string; page?: string };
}

export async function KayitlarTab({ projectId, searchParams }: KayitlarTabProps) {
  // Sanitize status — fall back to 'all' on invalid/missing value (T-05-IV)
  const rawStatus = searchParams.status ?? 'all';
  const status = (VALID_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus : 'all';

  // Sanitize page — coerce to a positive integer (T-05-IV)
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  const data = await getSubmissions(projectId, { status, page, pageSize: 25 });

  return (
    <KayitlarTabClient
      projectId={projectId}
      initialData={data}
      initialStatus={status}
    />
  );
}
