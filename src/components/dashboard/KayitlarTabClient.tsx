'use client';

/**
 * KayitlarTabClient.tsx
 *
 * Submissions list — client component.
 * Renders filter chips (Tümü / Bekliyor / Onaylandı / Reddedildi), a shadcn Table
 * with 7 LOCKED columns, prev/next pagination, and a next/image photo lightbox.
 *
 * D-53: columns — Fotoğraf, BOQ Kalemi, Miktar, Durum, Tarih, Konum, Notlar.
 * D-54: filter chips + pagination (page size 25) with URL-state.
 * D-55: filter + page in URL so state survives refresh.
 * D-57: distinct empty states for no-submissions vs filtered-no-results.
 * D-59: accessible table equivalent of the map.
 * D-60: overflow-x-auto mobile scroll; filter chips wrap.
 * D-61: photo lightbox via shadcn Dialog + next/image.
 * D-63: every user-facing string via next-intl (no hardcoded copy).
 *
 * Security (T-05-TN): Google Maps external link uses rel="noopener noreferrer".
 * Security (T-05-XSS): photos rendered only via next/image (validated remotePatterns).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubmissionRow {
  id: string;
  boqMaterial: string | null;
  quantity: number;
  unit: string | null;
  status: 'pending_audit' | 'approved' | 'rejected';
  decidedAt: string | null;
  submittedAt: string;
  locationLat: number | null;
  locationLon: number | null;
  photoUrl: string;
  notes: string | null;
  rejectionReason: string | null;
}

interface SubmissionsData {
  rows: SubmissionRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

interface KayitlarTabClientProps {
  projectId: string;
  initialData: SubmissionsData;
  initialStatus: string;
}

// ── Filter chip config ────────────────────────────────────────────────────────

const FILTER_CHIPS = [
  { key: 'filter_all', value: 'all' },
  { key: 'filter_pending', value: 'pending_audit' },
  { key: 'filter_approved', value: 'approved' },
  { key: 'filter_rejected', value: 'rejected' },
] as const;

// ── Locale number format (tabular-nums) ───────────────────────────────────────

const trFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });

function formatQty(value: number): string {
  if (isNaN(value)) return '—';
  return trFmt.format(value);
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, label }: { status: SubmissionRow['status']; label: string }) {
  if (status === 'approved') {
    return (
      <Badge className="bg-emerald-100 text-emerald-800">
        {label}
      </Badge>
    );
  }
  if (status === 'rejected') {
    return <Badge variant="destructive">{label}</Badge>;
  }
  // pending_audit
  return <Badge variant="secondary">{label}</Badge>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function KayitlarTabClient({
  projectId,
  initialData,
  initialStatus,
}: KayitlarTabClientProps) {
  const t = useTranslations('dashboard.submissions');
  const router = useRouter();

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxAlt, setLightboxAlt] = useState<string>('');

  // Navigate to updated URL when filter or page changes
  function navigate(status: string, page: number) {
    router.push(`/dashboard/projects/${projectId}?tab=kayitlar&status=${status}&page=${page}`);
  }

  function handleFilterChange(value: string) {
    navigate(value, 1); // always reset to page 1 on filter change (D-54)
  }

  function handlePageChange(newPage: number) {
    navigate(initialStatus, newPage);
  }

  const { rows, page, pageCount } = initialData;

  // ── Empty states (D-57) ───────────────────────────────────────────────────

  if (initialData.total === 0 && initialStatus === 'all') {
    return (
      <div className="space-y-6">
        <FilterChips
          initialStatus={initialStatus}
          onFilterChange={handleFilterChange}
          t={t}
        />
        <div className="py-12 text-center text-muted-foreground text-sm">
          {t('empty_all')}
        </div>
      </div>
    );
  }

  if (rows.length === 0 && initialStatus !== 'all') {
    return (
      <div className="space-y-6">
        <FilterChips
          initialStatus={initialStatus}
          onFilterChange={handleFilterChange}
          t={t}
        />
        <div className="py-12 text-center text-muted-foreground text-sm">
          {t('empty_filtered')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter chips (D-54, D-60) */}
      <FilterChips
        initialStatus={initialStatus}
        onFilterChange={handleFilterChange}
        t={t}
      />

      {/* Table with horizontal scroll for mobile (D-60) */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="w-16">{t('col_photo')}</TableHead>
              <TableHead scope="col" className="min-w-[160px]">{t('col_boq')}</TableHead>
              <TableHead scope="col" className="w-[120px] text-right">{t('col_quantity')}</TableHead>
              <TableHead scope="col" className="w-[110px]">{t('col_status')}</TableHead>
              <TableHead scope="col" className="w-[120px]">{t('col_date')}</TableHead>
              <TableHead scope="col" className="w-20">{t('col_location')}</TableHead>
              <TableHead scope="col" className="min-w-[160px]">{t('col_notes')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const dateStr = new Date(row.decidedAt ?? row.submittedAt).toLocaleDateString('tr-TR');
              const notesText = row.notes ?? '';
              const notesTruncated = notesText.length > 60 ? notesText.slice(0, 60) + '…' : notesText;
              const statusLabel =
                row.status === 'approved'
                  ? t('status_approved')
                  : row.status === 'rejected'
                  ? t('status_rejected')
                  : t('status_pending');
              const photoAlt = t('photo_alt', { material: row.boqMaterial ?? '' });

              return (
                <TableRow key={row.id}>
                  {/* Fotoğraf — next/image thumbnail, opens lightbox on click (D-61) */}
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => {
                        setLightboxUrl(row.photoUrl);
                        setLightboxAlt(photoAlt);
                      }}
                      className="relative block h-12 w-12 rounded overflow-hidden cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
                      aria-label={photoAlt}
                    >
                      <Image
                        src={row.photoUrl}
                        alt={photoAlt}
                        width={48}
                        height={48}
                        className="object-cover h-12 w-12"
                      />
                    </button>
                  </TableCell>

                  {/* BOQ Kalemi */}
                  <TableCell className="break-words">
                    {row.boqMaterial ?? '—'}
                  </TableCell>

                  {/* Miktar (tabular-nums, right-aligned) */}
                  <TableCell className="text-right tabular-nums">
                    {formatQty(row.quantity)}{row.unit ? ' ' + row.unit : ''}
                  </TableCell>

                  {/* Durum badge */}
                  <TableCell>
                    <StatusBadge status={row.status} label={statusLabel} />
                  </TableCell>

                  {/* Tarih */}
                  <TableCell className="tabular-nums">{dateStr}</TableCell>

                  {/* Konum — Google Maps link (T-05-TN) */}
                  <TableCell>
                    {row.locationLat != null && row.locationLon != null ? (
                      <a
                        href={`https://maps.google.com/?q=${row.locationLat},${row.locationLon}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    ) : (
                      '—'
                    )}
                  </TableCell>

                  {/* Notlar — truncate 60 chars, full text in title */}
                  <TableCell
                    title={notesText || undefined}
                    className="text-sm text-muted-foreground"
                  >
                    {notesTruncated || '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination (D-54) */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => handlePageChange(page - 1)}
        >
          {t('prev')}
        </Button>

        <span className="text-sm text-muted-foreground tabular-nums">
          {t('pagination', { page, pages: Math.max(1, pageCount) })}
        </span>

        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => handlePageChange(page + 1)}
        >
          {t('next')}
        </Button>
      </div>

      {/* Photo lightbox (D-61) */}
      <Dialog
        open={!!lightboxUrl}
        onOpenChange={(open) => {
          if (!open) setLightboxUrl(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          {lightboxUrl && (
            <Image
              src={lightboxUrl}
              alt={lightboxAlt}
              width={800}
              height={600}
              style={{ objectFit: 'contain' }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── FilterChips sub-component ─────────────────────────────────────────────────

interface FilterChipsProps {
  initialStatus: string;
  onFilterChange: (value: string) => void;
  t: ReturnType<typeof useTranslations>;
}

function FilterChips({ initialStatus, onFilterChange, t }: FilterChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTER_CHIPS.map(({ key, value }) => {
        const isActive = initialStatus === value;
        return (
          <Button
            key={value}
            variant="outline"
            size="sm"
            className={`min-h-[44px] ${
              isActive ? 'border-primary text-primary' : ''
            }`}
            onClick={() => onFilterChange(value)}
            aria-pressed={isActive}
          >
            {t(key)}
          </Button>
        );
      })}
    </div>
  );
}
