/**
 * AiFlagCard.tsx
 *
 * Advisory AI flag card — Phase 16 AI Vision Assist (SC3, AI-03).
 *
 * Receives `flag: SubmissionAiFlag | null` as prop.
 * Hard gate: if (!flag) return null — zero DOM when no eval_passed flag exists (SC3).
 *
 * Renders ONE row PER FIRED SIGNAL (REVIEWS HIGH-3 — never assume mismatch):
 *   - Photo mismatch row  iff flag.photoMismatch
 *   - Photo quality row   iff flag.photoQualityFlag
 *   - Location row        iff flag.locationOpinion === 'inconsistent'
 *   - Duplicate row       iff flag.isDuplicate
 * Plus a material suggestion row when flag.materialSuggestion is present.
 *
 * Each signal row: lucide icon (aria-hidden) + anomaly description + traffic-light
 * BrandBadge (success/warning/destructive keyed on confidence score) + mono score.
 *
 * AI-03: Advisory card only — zero decision affordance (no buttons, no callbacks).
 * Advisory framing enforced by BrandBadge variant="neutral" ("Tavsiye Niteliğinde").
 *
 * This component is a pure presentational server component (no 'use client').
 * Data flows down as a prop from the page RSC that calls getSubmissionAiFlag.
 */

import { useTranslations } from 'next-intl';
import { Bot, ImageOff, Eye, MapPin, FileText, Copy } from 'lucide-react';
import { BrandBadge, BrandCard, BrandHeading } from '@/components/brand';
import type { SubmissionAiFlag } from '@/actions/ai-flags';

// ── Traffic-light confidence mapping (UI-SPEC Color section) ──────────────────

function confidenceBadgeVariant(score: number): 'success' | 'warning' | 'destructive' {
  if (score >= 0.75) return 'success';
  if (score >= 0.50) return 'warning';
  return 'destructive';
}

function confidenceLevelLabel(
  score: number,
  t: ReturnType<typeof useTranslations>,
): string {
  if (score >= 0.75) return t('confidence_high');
  if (score >= 0.50) return t('confidence_medium');
  return t('confidence_low');
}

// ── SignalRow — one per fired signal ─────────────────────────────────────────

interface SignalRowProps {
  icon: React.ReactNode;
  description: string;
  confidence: number | null;
  t: ReturnType<typeof useTranslations>;
}

function SignalRow({ icon, description, confidence, t }: SignalRowProps) {
  return (
    <div className="space-y-1">
      <dt className="flex items-center gap-1 text-xs font-medium text-slate-500">
        {icon}
      </dt>
      <dd className="text-sm leading-[1.5] text-slate-800">
        {description}
      </dd>
      {confidence != null && (
        <div className="flex items-center gap-1 mt-1">
          <BrandBadge
            variant={confidenceBadgeVariant(confidence)}
            aria-label={`Güven skoru: ${confidence.toFixed(2)} — ${confidenceLevelLabel(confidence, t)}`}
          >
            {confidenceLevelLabel(confidence, t)}
          </BrandBadge>
          <span className="font-mono text-xs text-slate-500">
            {confidence.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── AiFlagCard ────────────────────────────────────────────────────────────────

interface AiFlagCardProps {
  flag: SubmissionAiFlag | null;
}

export function AiFlagCard({ flag }: AiFlagCardProps) {
  if (!flag) return null;

  const t = useTranslations('dashboard.admin.ai_flags');

  // Determine which signals fired (REVIEWS HIGH-3: render only fired signals)
  const hasMismatch  = flag.photoMismatch;
  const hasQuality   = flag.photoQualityFlag;
  const hasLocation  = flag.locationOpinion === 'inconsistent';
  const hasDuplicate = flag.isDuplicate;

  // Use anomalyDescription as the per-signal description text.
  // This is stored in Turkish by the AI model (UI-SPEC §Copywriting Contract).
  const description = flag.anomalyDescription ?? '';

  return (
    <section aria-label={t('card_heading')}>
      <BrandCard className="border-slate-200 shadow-none rounded-md">
        <BrandCard.Header className="p-3 flex items-center justify-between gap-2">
          <BrandHeading as="h3" size="h3" className="text-base font-semibold">
            {t('card_heading')}
          </BrandHeading>
          <Bot size={16} className="text-slate-400" aria-hidden="true" />
          <BrandBadge variant="neutral">{t('advisory_badge')}</BrandBadge>
        </BrandCard.Header>

        <BrandCard.Body className="p-4">
          <dl className="space-y-3">
            {/* Photo mismatch signal — only when flag.photoMismatch */}
            {hasMismatch && (
              <SignalRow
                icon={<ImageOff size={16} className="text-slate-500" aria-hidden="true" />}
                description={description}
                confidence={flag.photoMismatchConfidence}
                t={t}
              />
            )}

            {/* Photo quality signal — only when flag.photoQualityFlag */}
            {hasQuality && (
              <SignalRow
                icon={<Eye size={16} className="text-slate-500" aria-hidden="true" />}
                description={description}
                confidence={flag.photoQualityConfidence}
                t={t}
              />
            )}

            {/* Location second-opinion signal — only when locationOpinion === 'inconsistent' */}
            {hasLocation && (
              <SignalRow
                icon={<MapPin size={16} className="text-slate-500" aria-hidden="true" />}
                description={description}
                confidence={flag.locationOpinionConfidence}
                t={t}
              />
            )}

            {/* Duplicate detection signal — only when isDuplicate */}
            {hasDuplicate && (
              <SignalRow
                icon={<Copy size={16} className="text-slate-500" aria-hidden="true" />}
                description={description}
                confidence={null}
                t={t}
              />
            )}

            {/* Material suggestion row — only when materialSuggestion is present */}
            {flag.materialSuggestion && (
              <div className="pt-1 border-t border-slate-100">
                <dt className="flex items-center gap-1 text-xs font-medium text-slate-500">
                  <FileText size={16} className="text-slate-500" aria-hidden="true" />
                  {t('suggested_classification_label')}
                </dt>
                <dd className="text-sm leading-[1.5] text-slate-800 mt-1">
                  {flag.materialSuggestion}
                </dd>
              </div>
            )}
          </dl>
        </BrandCard.Body>
      </BrandCard>
    </section>
  );
}
