'use client';

/**
 * LineSubmissionsPanel.tsx
 *
 * SDH-02: inline-expand-row traceability UI for the Yeşil Defter line table.
 *
 * Each period line row in the [periodId] detail page mounts one panel. Clicking
 * the chevron trigger fetches the contributing submissions via getLineSubmissions
 * (auth-guarded + tenant-scoped Server Action from Plan 12-03) and renders them
 * inline below the trigger.
 *
 * State model:
 *   - expanded (bool): UI toggle for the inline sub-table
 *   - rows (LineSubmission[] | null): null = not yet fetched, [] = empty result
 *   - loading (bool): true while the Server Action call is in-flight
 *
 * The data is fetched lazily on first expand and cached for the lifetime of the
 * page render. LivePeriodPoller's router.refresh() resets state naturally by
 * re-rendering the whole RSC tree.
 *
 * Security (T-12-04-IDOR + T-12-04-TAB + T-12-04-XSS):
 *   - periodLineId is tenant-scoped by getLineSubmissions on the server side.
 *   - Photo link uses target="_blank" + rel="noopener noreferrer" (reverse-tabnabbing).
 *   - Worker name + notes rendered as plain text inside TableCell — React auto-escapes.
 *
 * Phase 13 brand pass note: this UI is intentionally minimal — shadcn primitives,
 * ghost button, no bespoke styling. The brand pass owns visual polish.
 */

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { BrandButton, BrandTable } from '@/components/brand';
import { getLineSubmissions, type LineSubmission } from '@/actions/hakedis';

interface LineSubmissionsPanelProps {
  /** hakedis_period_lines.id — passed from the RSC parent's lines.map(line => …). */
  periodLineId: string;
  /** Period quantity from the parent line row (e.g., "5.000"); displayed in the trigger label. */
  periodQty: string;
  /** Unit snapshot from the parent line row (e.g., "m"); appended to qty for context. */
  unitSnapshot: string;
}

/** Format a Postgres timestamptz ISO string as dd.MM.yyyy HH:mm (Istanbul TZ display). */
function formatDateTimeTR(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    // Render in Istanbul (Europe/Istanbul) so the office UI matches the period_end_date cutoff TZ.
    const fmt = new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    // Intl tr-TR yields "dd.MM.yyyy HH:mm" — the same shape we want.
    return fmt.format(d).replace(',', '');
  } catch {
    return iso;
  }
}

export function LineSubmissionsPanel({
  periodLineId,
  periodQty,
  unitSnapshot,
}: LineSubmissionsPanelProps) {
  const t = useTranslations('dashboard.admin.hakedis.line_submissions');

  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<LineSubmission[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    // First-time expand: fetch the contributing submissions via the Server Action.
    if (next && rows === null) {
      startTransition(async () => {
        try {
          const fetched = await getLineSubmissions(periodLineId);
          setRows(fetched);
        } catch {
          // Surface as an empty list — the manual Recompute button is a recovery path.
          setRows([]);
        }
      });
    }
  }

  const triggerLabel = t('trigger_label', { count: `${periodQty} ${unitSnapshot}` });
  const Icon = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="space-y-2">
      <BrandButton
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-label={triggerLabel}
        disabled={isPending}
      >
        <Icon className="h-4 w-4 mr-1" aria-hidden="true" />
        <span className="text-xs">{t('heading')}</span>
      </BrandButton>

      {expanded && (
        <div className="rounded-md border bg-muted/30 p-2">
          {isPending ? (
            <p className="text-xs text-muted-foreground py-2 px-1">…</p>
          ) : rows === null || rows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 px-1">
              {t('empty')}
            </p>
          ) : (
            <BrandTable.Root>
              <BrandTable.Header>
                <BrandTable.Row>
                  <BrandTable.Head scope="col" className="text-xs">
                    {t('col_worker')}
                  </BrandTable.Head>
                  <BrandTable.Head scope="col" className="text-xs">
                    {t('col_decided_at')}
                  </BrandTable.Head>
                  <BrandTable.Head scope="col" className="text-xs text-right tabular-nums">
                    {t('col_qty')}
                  </BrandTable.Head>
                  <BrandTable.Head scope="col" className="text-xs">
                    {t('col_notes')}
                  </BrandTable.Head>
                  <BrandTable.Head scope="col" className="text-xs">
                    {t('col_photo')}
                  </BrandTable.Head>
                </BrandTable.Row>
              </BrandTable.Header>
              <BrandTable.Body>
                {rows.map((row) => (
                  <BrandTable.Row key={row.submissionId}>
                    <BrandTable.Cell className="text-xs">{row.workerName}</BrandTable.Cell>
                    <BrandTable.Cell className="text-xs tabular-nums">
                      {formatDateTimeTR(row.decidedAt)}
                    </BrandTable.Cell>
                    <BrandTable.Cell className="text-xs text-right tabular-nums">
                      {row.qtyContributed} {unitSnapshot}
                    </BrandTable.Cell>
                    <BrandTable.Cell className="text-xs">{row.notes ?? '—'}</BrandTable.Cell>
                    <BrandTable.Cell className="text-xs">
                      <a
                        href={row.photoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('photo_view')}
                        className="underline"
                      >
                        {t('photo_view')}
                      </a>
                    </BrandTable.Cell>
                  </BrandTable.Row>
                ))}
              </BrandTable.Body>
            </BrandTable.Root>
          )}
        </div>
      )}
    </div>
  );
}
