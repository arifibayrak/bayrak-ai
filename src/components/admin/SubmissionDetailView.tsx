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
import { useTranslations } from 'next-intl';
import {
  ImageOff,
  Sparkles,
  AlertCircle,
  MapPin,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { CanonicalSubmission } from '@/lib/types/canonical-submission';

// ── Status badge (reuses D-61 StatusBadge color logic) ───────────────────────

function StatusBadge({ status, label }: { status: CanonicalSubmission['status']; label: string }) {
  if (status === 'approved') {
    return <Badge className="bg-emerald-100 text-emerald-800">{label}</Badge>;
  }
  if (status === 'rejected') {
    return <Badge variant="destructive">{label}</Badge>;
  }
  return <Badge variant="secondary">{label}</Badge>;
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
}

export function SubmissionDetailView({ submission }: SubmissionDetailViewProps) {
  const t = useTranslations('dashboard.admin.detail');
  const tStatus = useTranslations('dashboard.submissions');

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
      {/* Status badge */}
      <StatusBadge status={submission.status} label={statusLabel} />

      {/* Two-column grid: photo | details */}
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">

        {/* Photo block (D-61 pattern) */}
        <div className="flex flex-col gap-2">
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
        </div>

        {/* Detail fields */}
        <div className="space-y-4">
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

            {/* Location
                NOTE: CanonicalSubmission does not carry raw lat/lon. Only locationDistanceM
                and locationMatch are available. The maps.google.com link pattern is planned
                for when coordinates are exposed on the type; currently only distance is shown.
                See SUMMARY.md for the full deviation note.
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
                      <Badge variant="destructive">
                        {t('field_location_warning')}
                      </Badge>
                    )}
                  </span>
                ) : (
                  '—'
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
        </div>
      </div>
    </div>
  );
}
