/**
 * /dashboard/settings — Threshold Settings Page
 *
 * Office-engineer-only (D-89). Auth-guarded at the top of the RSC mirroring the
 * established protected-page pattern from src/app/dashboard/layout.tsx lines 19-20.
 *
 * Security (T-09-06-EoP):
 *   `const session = await auth(); if (!session) redirect('/auth/signin');`
 *   Mirrors exact guard in layout.tsx — non-authenticated access redirects before any data fetch.
 *   Server action also enforces auth (double guard, defense in depth).
 *
 * force-dynamic: reads live threshold values on every render (UI-SPEC Liveness).
 * No sidebar item (D-86) — reachable only via TopNav gear icon.
 */

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { getTenantSettings } from '@/actions/settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ThresholdSettingsForm } from '@/components/admin/ThresholdSettingsForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  // T-09-06-EoP: office-engineer-only guard — mirrors layout.tsx lines 19-20 exactly
  const session = await auth();
  if (!session) redirect('/auth/signin');

  const t = await getTranslations('dashboard.admin.settings');

  // getTenantSettings is itself auth-guarded + tenant-scoped (double guard)
  const settings = await getTenantSettings();

  // Convert 0..1 decimal → 0–100 integer for the form's % display
  const defaultRejectionRatePercent = Math.round(Number(settings.rejectionRateThreshold) * 100);

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('heading')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Threshold form card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('form_section_title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ThresholdSettingsForm
            defaultAuditSlaHours={settings.auditSlaHours}
            defaultRejectionRatePercent={defaultRejectionRatePercent}
            defaultStalledDays={settings.stalledDays}
          />
        </CardContent>
      </Card>
    </div>
  );
}
