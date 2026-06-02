'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { BrandButton, BrandCard, BrandHeading, BrandLogo } from '@/components/brand';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function SignInPage() {
  const t = useTranslations('auth.signin');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await signIn('resend', {
        email: email.trim().toLowerCase(),
        callbackUrl: '/dashboard',
        redirect: false,
      });

      if (result?.error) {
        setError(t('error_not_allowed'));
      } else {
        setSent(true);
      }
    } catch {
      setError(t('error_not_allowed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-16">
      <BrandCard className="w-full max-w-md mx-auto">
        <BrandCard.Header className="flex flex-col items-center text-center gap-3 pb-2">
          <BrandLogo size="lg" />
          <BrandHeading as="h1" size="h2" className="leading-tight">
            {t('subheading')}
          </BrandHeading>
          <p className="text-sm text-muted-foreground">{t('heading')}</p>
        </BrandCard.Header>

        <BrandCard.Body>
          {sent ? (
            <p className="text-sm text-center text-muted-foreground">{t('success')}</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">{t('email_label')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  autoFocus
                />
              </div>

              <BrandButton
                type="submit"
                variant="primary"
                size="md"
                className="w-full"
                disabled={loading || !email.trim()}
              >
                {loading ? t('sending') : t('cta')}
              </BrandButton>

              <p className="text-sm text-muted-foreground text-center">{t('helper')}</p>
            </form>
          )}
        </BrandCard.Body>
      </BrandCard>
    </div>
  );
}
