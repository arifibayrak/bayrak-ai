/**
 * Account management — /dashboard/settings/users (ADMIN ONLY).
 *
 * Manages WEB accounts (Auth.js users) and their RBAC role. @bayrak.ai accounts
 * are admins by domain and shown locked. Others can be set office_engineer or
 * audit_engineer. requireAdmin() redirects non-admins; setUserRole re-checks.
 */
import { getTranslations } from 'next-intl/server';
import { ShieldCheck } from 'lucide-react';
import { requireAdmin } from '@/lib/rbac';
import { getAccounts } from '@/actions/users';
import { BrandBadge, BrandCard, BrandHeading, BrandTable } from '@/components/brand';
import { AccountRoleSelect } from '@/components/admin/AccountRoleSelect';

export const dynamic = 'force-dynamic';

function roleBadge(role: string, t: Awaited<ReturnType<typeof getTranslations>>) {
  if (role === 'admin') return <BrandBadge variant="primary">{t('role_admin')}</BrandBadge>;
  if (role === 'audit_engineer') return <BrandBadge variant="info">{t('role_audit')}</BrandBadge>;
  return <BrandBadge variant="neutral">{t('role_office')}</BrandBadge>;
}

export default async function AccountsPage() {
  await requireAdmin();
  const t = await getTranslations('dashboard.admin.users');
  const accounts = await getAccounts();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BrandHeading as="h1" size="h1">{t('heading')}</BrandHeading>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <BrandCard>
        <BrandCard.Body className="p-0 overflow-x-auto">
          <BrandTable.Root>
            <BrandTable.Header>
              <BrandTable.Row>
                <BrandTable.Head scope="col">{t('col_name')}</BrandTable.Head>
                <BrandTable.Head scope="col">{t('col_email')}</BrandTable.Head>
                <BrandTable.Head scope="col">{t('col_role')}</BrandTable.Head>
                <BrandTable.Head scope="col">{t('col_manage')}</BrandTable.Head>
              </BrandTable.Row>
            </BrandTable.Header>
            <BrandTable.Body>
              {accounts.map((a) => (
                <BrandTable.Row key={a.id}>
                  <BrandTable.Cell className="font-medium">{a.name ?? '—'}</BrandTable.Cell>
                  <BrandTable.Cell className="text-sm text-muted-foreground">{a.email ?? '—'}</BrandTable.Cell>
                  <BrandTable.Cell>{roleBadge(a.effectiveRole, t)}</BrandTable.Cell>
                  <BrandTable.Cell>
                    {a.locked ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <ShieldCheck className="size-3.5" aria-hidden="true" />
                        {t('locked_admin')}
                      </span>
                    ) : (
                      <AccountRoleSelect userId={a.id} currentRole={a.effectiveRole} />
                    )}
                  </BrandTable.Cell>
                </BrandTable.Row>
              ))}
            </BrandTable.Body>
          </BrandTable.Root>
        </BrandCard.Body>
      </BrandCard>
    </div>
  );
}
