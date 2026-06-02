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

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ShieldCheck } from 'lucide-react';
import { requireWriteAccess } from '@/lib/rbac';
import { ROLES } from '@/lib/authz';
import { getTenantSettings } from '@/actions/settings';
import { BrandCard, BrandHeading } from '@/components/brand';
import { ThresholdSettingsForm } from '@/components/admin/ThresholdSettingsForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  // RBAC: admin + office only (audit_engineer is read-only → redirected).
  const { role } = await requireWriteAccess();

  const t = await getTranslations('dashboard.admin.settings');
  const tUsers = await getTranslations('dashboard.admin.users');

  // getTenantSettings is itself auth-guarded + tenant-scoped (double guard)
  const settings = await getTenantSettings();

  // Convert 0..1 decimal → 0–100 integer for the form's % display
  const defaultRejectionRatePercent = Math.round(Number(settings.rejectionRateThreshold) * 100);

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <div className="space-y-1">
        <BrandHeading as="h1" size="h1">{t('heading')}</BrandHeading>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Threshold form card */}
      <BrandCard>
        <BrandCard.Header>
          <BrandHeading as="h2" size="h3">{t('form_section_title')}</BrandHeading>
        </BrandCard.Header>
        <BrandCard.Body>
          <ThresholdSettingsForm
            defaultAuditSlaHours={settings.auditSlaHours}
            defaultRejectionRatePercent={defaultRejectionRatePercent}
            defaultStalledDays={settings.stalledDays}
          />
        </BrandCard.Body>
      </BrandCard>

      {/* Admin-only: account management entry point */}
      {role === ROLES.ADMIN && (
        <BrandCard>
          <BrandCard.Body>
            <Link
              href="/dashboard/settings/users"
              className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              {tUsers('settings_link')}
            </Link>
          </BrandCard.Body>
        </BrandCard>
      )}
    </div>
  );
}
