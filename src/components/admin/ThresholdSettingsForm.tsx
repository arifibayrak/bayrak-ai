'use client';

/**
 * ThresholdSettingsForm.tsx
 *
 * Client form for editing the 3 configurable alert thresholds.
 * Analog: src/components/dashboard/ProjectForm.tsx — 'use client', useState,
 * validate-on-submit, per-field aria-describedby, transient success Alert.
 *
 * Security (T-09-06-T): client-side validation on submit + server-action Zod validation.
 * Rejection rate: displayed/entered as % (0–100), converted to decimal (0–1) on submit.
 *
 * UI-SPEC Surface 4: "Save Thresholds" / "Eşikleri Kaydet" CTA (NOT "Save").
 * Alert colors: text-destructive for errors only (never --primary for success).
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { updateTenantSettings } from '@/actions/settings';

interface ThresholdSettingsFormProps {
  defaultAuditSlaHours: number;
  defaultRejectionRatePercent: number; // 0–100 (converted from 0–1 decimal on page load)
  defaultStalledDays: number;
}

export function ThresholdSettingsForm({
  defaultAuditSlaHours,
  defaultRejectionRatePercent,
  defaultStalledDays,
}: ThresholdSettingsFormProps) {
  const t = useTranslations('dashboard.admin.settings');

  // Field values — pre-populated from DB defaults
  const [auditSlaHours, setAuditSlaHours] = useState(defaultAuditSlaHours);
  const [rejectionRatePercent, setRejectionRatePercent] = useState(defaultRejectionRatePercent);
  const [stalledDays, setStalledDays] = useState(defaultStalledDays);

  // Per-field validation errors
  const [auditSlaError, setAuditSlaError] = useState('');
  const [rejectionRateError, setRejectionRateError] = useState('');
  const [stalledDaysError, setStalledDaysError] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Client-side validate on submit (not on blur — per ProjectForm pattern)
    let valid = true;

    if (!Number.isInteger(auditSlaHours) || auditSlaHours < 1 || auditSlaHours > 720) {
      setAuditSlaError(t('error_audit_sla'));
      valid = false;
    } else {
      setAuditSlaError('');
    }

    if (!Number.isInteger(rejectionRatePercent) || rejectionRatePercent < 0 || rejectionRatePercent > 100) {
      setRejectionRateError(t('error_rejection_rate'));
      valid = false;
    } else {
      setRejectionRateError('');
    }

    if (!Number.isInteger(stalledDays) || stalledDays < 1 || stalledDays > 365) {
      setStalledDaysError(t('error_stalled_days'));
      valid = false;
    } else {
      setStalledDaysError('');
    }

    if (!valid) return;

    setServerError('');
    setSubmitting(true);

    try {
      // Convert rejection rate % → 0..1 decimal before calling server action
      await updateTenantSettings({
        auditSlaHours,
        rejectionRateThreshold: rejectionRatePercent / 100,
        stalledDays,
      });

      // Transient success Alert — shown for 3 seconds, then disappears (fields retain values)
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setServerError(t('error_save_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6 max-w-xl">
      {/* Row 1: Audit SLA Threshold */}
      <div className="space-y-1.5">
        <Label htmlFor="audit-sla">{t('audit_sla_label')}</Label>
        <p className="text-sm text-muted-foreground">{t('audit_sla_desc')}</p>
        <div className="flex items-center gap-2">
          <Input
            id="audit-sla"
            type="number"
            min={1}
            max={720}
            step={1}
            value={auditSlaHours}
            onChange={(e) => setAuditSlaHours(Number(e.target.value))}
            className="w-[120px] tabular-nums"
            aria-describedby={auditSlaError ? 'audit-sla-error' : undefined}
            disabled={submitting}
          />
          <span className="text-sm text-muted-foreground" aria-label={t('audit_sla_unit')}>
            {t('audit_sla_unit')}
          </span>
        </div>
        {auditSlaError && (
          <p id="audit-sla-error" className="text-sm text-destructive">
            {auditSlaError}
          </p>
        )}
      </div>

      {/* Row 2: Rejection Rate Alert */}
      <div className="space-y-1.5">
        <Label htmlFor="rejection-rate">{t('rejection_rate_label')}</Label>
        <p className="text-sm text-muted-foreground">{t('rejection_rate_desc')}</p>
        <div className="flex items-center gap-2">
          <Input
            id="rejection-rate"
            type="number"
            min={0}
            max={100}
            step={1}
            value={rejectionRatePercent}
            onChange={(e) => setRejectionRatePercent(Number(e.target.value))}
            className="w-[120px] tabular-nums"
            aria-describedby={rejectionRateError ? 'rejection-rate-error' : undefined}
            disabled={submitting}
          />
          <span className="text-sm text-muted-foreground" aria-label={t('rejection_rate_unit')}>
            {t('rejection_rate_unit')}
          </span>
        </div>
        {rejectionRateError && (
          <p id="rejection-rate-error" className="text-sm text-destructive">
            {rejectionRateError}
          </p>
        )}
      </div>

      {/* Row 3: Stalled Project Threshold */}
      <div className="space-y-1.5">
        <Label htmlFor="stalled-days">{t('stalled_days_label')}</Label>
        <p className="text-sm text-muted-foreground">{t('stalled_days_desc')}</p>
        <div className="flex items-center gap-2">
          <Input
            id="stalled-days"
            type="number"
            min={1}
            max={365}
            step={1}
            value={stalledDays}
            onChange={(e) => setStalledDays(Number(e.target.value))}
            className="w-[120px] tabular-nums"
            aria-describedby={stalledDaysError ? 'stalled-days-error' : undefined}
            disabled={submitting}
          />
          <span className="text-sm text-muted-foreground" aria-label={t('stalled_days_unit')}>
            {t('stalled_days_unit')}
          </span>
        </div>
        {stalledDaysError && (
          <p id="stalled-days-error" className="text-sm text-destructive">
            {stalledDaysError}
          </p>
        )}
      </div>

      {/* Server error */}
      {serverError && (
        <p className="text-sm text-destructive">{serverError}</p>
      )}

      {/* Transient success Alert (3 seconds) OR submit button */}
      {saved ? (
        <Alert className="max-w-xl">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{t('saved_success')}</AlertDescription>
        </Alert>
      ) : (
        <Button type="submit" disabled={submitting}>
          {submitting ? t('saving') : t('save_cta')}
        </Button>
      )}
    </form>
  );
}
