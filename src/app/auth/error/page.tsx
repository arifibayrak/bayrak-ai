import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { BrandButton, BrandEmpty } from '@/components/brand';

// Note: This is a Server Component — error type comes from Auth.js searchParams
export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorType = params.error;

  return <AuthErrorContent errorType={errorType} />;
}

// Client component for i18n translations
function AuthErrorContent({ errorType }: { errorType?: string }) {
  const t = useTranslations('auth.signin');

  // Auth.js sends AccessDenied for a failed signIn callback (allowlist block)
  // Parsing preserved verbatim — only visual rendering changed
  const isAccessDenied =
    !errorType || errorType === 'AccessDenied' || errorType === 'Verification';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-md mx-auto">
        <BrandEmpty
          icon={<TriangleAlert className="size-12 text-destructive" />}
          title={t('heading')}
          description={isAccessDenied ? t('error_not_allowed') : t('error_not_allowed')}
          action={
            <BrandButton variant="outline" render={<Link href="/auth/signin" />}>
              {t('cta')}
            </BrandButton>
          }
        />
      </div>
    </div>
  );
}
