import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

/**
 * Hakkediş stub page — coming-soon placeholder.
 * Full implementation deferred to Phase 10 (billing).
 * Copy from dashboard.admin.stubs namespace (added in plan 08-01).
 */
export default async function HakedisPage() {
  const t = await getTranslations('dashboard.admin.stubs');
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('hakedis_heading')}</h1>
        <Badge variant="secondary">{t('coming_soon')}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{t('hakedis_body')}</p>
    </div>
  );
}
