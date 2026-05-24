import { useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

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
  const isAccessDenied =
    !errorType || errorType === 'AccessDenied' || errorType === 'Verification';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-2">
          <h1 className="text-[28px] font-semibold leading-tight">{t('heading')}</h1>
        </CardHeader>

        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>
              {isAccessDenied ? t('error_not_allowed') : t('error_not_allowed')}
            </AlertDescription>
          </Alert>

          <Button render={<Link href="/auth/signin" />} variant="outline" className="w-full">
            {t('cta')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
