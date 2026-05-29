/**
 * Canonical submission detail page — /dashboard/records/[id]
 *
 * D-71: single canonical detail page for every submission reference in the app.
 * D-72: KayitlarTabClient and ActivityTimeline both link here.
 *
 * Single-record lookup: getCanonicalSubmissions({ submissionId: id }).
 * Returns notFound() if no record matches — renders existing 404 page.
 *
 * Filter preservation: searchParams carries the filter context from the records list
 * so the back link returns the user to their filtered view.
 *
 * Security (T-08-06-IV):
 *   - id is passed as a bound param via getCanonicalSubmissions (Drizzle sql``)
 *   - searchParams are used only to reconstruct the back link href — never reach SQL
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCanonicalSubmissions } from '@/actions/analytics';
import { SubmissionDetailView } from '@/components/admin/SubmissionDetailView';
import { BrandCard, BrandHeading } from '@/components/brand';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    from?: string;
    to?: string;
    project?: string;
    person?: string;
    status?: string;
    page?: string;
  }>;
}

export default async function SubmissionDetailPage({ params, searchParams }: Props) {
  const { id } = await params;

  // Single-record lookup — T-08-06-IV: id is a bound param inside getCanonicalSubmissions
  const rows = await getCanonicalSubmissions({ submissionId: id });

  // D-71: notFound if record not found — renders existing Next.js 404 page
  if (rows.length === 0) notFound();

  const submission = rows[0];

  const t = await getTranslations('dashboard.admin.detail');

  // Reconstruct the filter back link from searchParams so the user returns to their
  // filtered records list (searchParams used for href construction only — never SQL)
  const { from, to, project, person, status, page } = await searchParams;
  const backParams = new URLSearchParams();
  if (from) backParams.set('from', from);
  if (to) backParams.set('to', to);
  if (project) backParams.set('project', project);
  if (person) backParams.set('person', person);
  if (status) backParams.set('status', status);
  if (page) backParams.set('page', page);
  const backQs = backParams.toString();
  const backHref = backQs ? `/dashboard/records?${backQs}` : '/dashboard/records';

  return (
    <div className="space-y-6">
      {/* Filter-preserving back link */}
      <nav className="text-sm text-muted-foreground">
        <Link href={backHref} className="hover:underline">
          {t('back')}
        </Link>
      </nav>

      {/* Page heading */}
      <BrandHeading as="h1" size="h1">{t('heading')}</BrandHeading>

      {/* Full submission detail view */}
      <BrandCard>
        <BrandCard.Body>
          <SubmissionDetailView submission={submission} />
        </BrandCard.Body>
      </BrandCard>
    </div>
  );
}
