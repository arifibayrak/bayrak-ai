'use client';

/**
 * SubmissionDetailView.tsx
 *
 * Full canonical submission detail view.
 * Props: a single CanonicalSubmission.
 *
 * Layout: status Badge, two-column grid (photo left / details right on desktop; stacked mobile).
 * Photo: next/image thumbnail → shadcn Dialog lightbox (D-61 pattern reused verbatim).
 * Details: dl/dt/dd semantic pairs for all fields.
 * Location: distance from route + location warning badge when locationMatch === 'far'.
 *   NOTE: CanonicalSubmission does not carry raw lat/lon coordinates — only
 *   locationDistanceM and locationMatch. Google Maps link is therefore not available
 *   from the canonical type; distance-only rendering is shown instead.
 *   If raw coordinates are added to CanonicalSubmission in a future phase, add the
 *   Maps link following the maps.google.com/?q=lat,lon pattern from PATTERNS.md.
 *   maps.google.com is referenced here as documentation of the planned link pattern.
 * Rejection reason: rendered only when status === 'rejected', inside a muted Alert.
 * AI flags slot: always rendered as an inert secondary Alert (Phase 6 deferred).
 *
 * Security (T-08-06-XSS): rejection_reason / notes auto-escaped by React JSX.
 * Security (T-08-06-TN): Google Maps link uses rel="noopener noreferrer" when present.
 * Security (T-08-06-SSRF): photos via next/image (validated remotePatterns in next.config.ts).
 */

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ImageOff,
  Sparkles,
  AlertCircle,
  MapPin,
  ChevronLeft,
} from 'lucide-react';
import { BrandBadge, BrandCard } from '@/components/brand';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { CanonicalSubmission } from '@/lib/types/canonical-submission';

// ── Status badge (reuses D-61 StatusBadge color logic) ───────────────────────

function StatusBadge({ status, label }: { status: CanonicalSubmission['status']; label: string }) {
  if (status === 'approved') {
    return <BrandBadge variant="success">{label}</BrandBadge>;
  }
  if (status === 'rejected') {
    return <BrandBadge variant="destructive">{label}</BrandBadge>;
  }
  // pending_audit
  return <BrandBadge variant="info">{label}</BrandBadge>;
}

// ── Locale formatters ─────────────────────────────────────────────────────────

const qtyFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });

function formatQty(value: string): string {
  const n = parseFloat(value);
  if (isNaN(n)) return value;
  return qtyFmt.format(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('tr-TR');
}

// ── Main component ────────────────────────────────────────────────────────────

interface SubmissionDetailViewProps {
  submission: CanonicalSubmission;
  /** When 'asbuilt', renders a back-link to the As-Built strip (CHN-05 drill-down return path). */
  from?: string;
}

export function SubmissionDetailView({ submission, from }: SubmissionDetailViewProps) {
  const t = useTranslations('dashboard.admin.detail');
  const tRecords = useTranslations('dashboard.admin.records');
  const tStatus = useTranslations('dashboard.submissions');
  const router = useRouter();

  const [lightboxOpen, setLightboxOpen] = useState(false);

  const statusLabel =
    submission.status === 'approved'
      ? tStatus('status_approved')
      : submission.status === 'rejected'
      ? tStatus('status_rejected')
      : tStatus('status_pending');

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* As-Built back-link — rendered only when navigated from the As-Built strip (CHN-05) */}
      {from === 'asbuilt' && (
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {tRecords('back_to_asbuilt')}
        </button>
      )}

      {/* Status badge */}
      <StatusBadge status={submission.status} label={statusLabel} />

      {/* Two-column grid: photo | details */}
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">

        {/* Photo block (D-61 pattern) */}
        <BrandCard>
          <BrandCard.Body className="flex flex-col gap-2 p-3">
            {submission.photoUrl ? (
              <>
                {/* Thumbnail — opens lightbox on click */}
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="relative block h-[200px] w-[200px] rounded overflow-hidden cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label={t('photo_alt')}
                >
                  <Image
                    src={submission.photoUrl}
                    alt={t('photo_alt')}
                    width={200}
                    height={200}
                    className="object-cover h-[200px] w-[200px]"
                  />
                </button>

                {/* "View original" link — opens full-resolution photo in new tab.
                    Security (T-08-06-TN): target="_blank" requires rel="noopener noreferrer"
                    to mitigate reverse-tabnabbing (untrusted opener access to window.opener). */}
                <a
                  href={submission.photoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  {t('photo_alt')} ↗
                </a>

                {/* Lightbox dialog (D-61 pattern — verbatim from KayitlarTabClient) */}
                <Dialog
                  open={lightboxOpen}
                  onOpenChange={(open) => {
                    if (!open) setLightboxOpen(false);
                  }}
                >
                  <DialogContent className="max-w-3xl">
                    <Image
                      src={submission.photoUrl}
                      alt={t('photo_alt')}
                      width={800}
                      height={600}
                      style={{ objectFit: 'contain' }}
                    />
                  </DialogContent>
                </Dialog>
              </>
            ) : (
              /* No-photo state */
              <div className="flex h-[200px] w-[200px] items-center justify-center rounded bg-muted text-muted-foreground">
                <ImageOff className="h-12 w-12" aria-hidden="true" />
                <span className="sr-only">{t('no_photo')}</span>
              </div>
            )}
          </BrandCard.Body>
        </BrandCard>

        {/* Detail fields */}
        <BrandCard>
          <BrandCard.Body className="space-y-4">
          <dl className="space-y-3">
            {/* Worker */}
            <div>
              <dt className="text-sm font-semibold text-muted-foreground">{t('field_worker')}</dt>
              <dd className="text-sm">{submission.workerName}</dd>
            </div>

            {/* Project */}
            <div>
              <dt className="text-sm font-semibold text-muted-foreground">{t('field_project')}</dt>
              <dd className="text-sm">{submission.projectName}</dd>
            </div>

            {/* BOQ Item */}
            <div>
              <dt className="text-sm font-semibold text-muted-foreground">{t('field_boq')}</dt>
              <dd className="text-sm">{submission.material}</dd>
            </div>

            {/* Quantity */}
            <div>
              <dt className="text-sm font-semibold text-muted-foreground">{t('field_quantity')}</dt>
              <dd className="text-sm tabular-nums">
                {formatQty(submission.quantity)} {submission.unit}
              </dd>
            </div>

            {/* Submitted */}
            <div>
              <dt className="text-sm font-semibold text-muted-foreground">{t('field_submitted')}</dt>
              <dd className="text-sm tabular-nums">{formatDate(submission.submittedAt)}</dd>
            </div>

            {/* Location — distance from route + optional Google Maps link.
                Phase 15 (Plan 03): CanonicalSubmission now carries snappedLat/snappedLon
                from ST_Y/ST_X of snapped_point. Google Maps link shown when both are non-null.
                CRITICAL: lat first, lon second in the URL (?q=lat,lon) — no axis swap (Pitfall 5).
                Security (T-15-03-TABNAB): target="_blank" uses rel="noopener noreferrer".
            */}
            <div>
              <dt className="text-sm font-semibold text-muted-foreground">{t('field_location')}</dt>
              <dd className="text-sm">
                {submission.locationDistanceM != null ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="tabular-nums">
                      {parseFloat(submission.locationDistanceM).toFixed(0)} m
                    </span>
                    {submission.locationMatch === 'far' && (
                      <BrandBadge variant="destructive">
                        {t('field_location_warning')}
                      </BrandBadge>
                    )}
                  </span>
                ) : (
                  '—'
                )}
                {/* Google Maps link — only when snapped coordinates are available (non-no_route submissions) */}
                {submission.snappedLat != null && submission.snappedLon != null && (
                  <a
                    href={`https://www.google.com/maps?q=${submission.snappedLat},${submission.snappedLon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary underline mt-1"
                  >
                    <MapPin className="size-3" aria-hidden="true" />
                    {tRecords('view_on_map')}
                  </a>
                )}
              </dd>
            </div>

            {/* Auditor */}
            <div>
              <dt className="text-sm font-semibold text-muted-foreground">{t('field_auditor')}</dt>
              <dd className="text-sm">{submission.auditorName ?? '—'}</dd>
            </div>

            {/* Decided at */}
            <div>
              <dt className="text-sm font-semibold text-muted-foreground">{t('field_decided')}</dt>
              <dd className="text-sm tabular-nums">{formatDate(submission.decidedAt)}</dd>
            </div>

            {/* Rejection reason — only when rejected */}
            {submission.status === 'rejected' && submission.rejectionReason && (
              <div>
                <dt className="text-sm font-semibold text-muted-foreground">
                  {t('field_rejection_reason')}
                </dt>
                <dd className="mt-1">
                  <Alert>
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    <AlertDescription>
                      {/* React JSX auto-escapes text — XSS guard (T-08-06-XSS) */}
                      {submission.rejectionReason}
                    </AlertDescription>
                  </Alert>
                </dd>
              </div>
            )}
          </dl>

          {/* AI flags slot — always rendered as inert placeholder (Phase 6 deferred, D-71) */}
          <Alert variant="default" className="bg-muted/50 border-muted">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <AlertTitle className="text-sm font-semibold">{t('ai_slot_label')}</AlertTitle>
            <AlertDescription className="text-sm">
              {/* ai_slot_body is the key asserted by the plan's verification step */}
              {t('ai_slot_body')}
            </AlertDescription>
          </Alert>
          </BrandCard.Body>
        </BrandCard>
      </div>
    </div>
  );
}
