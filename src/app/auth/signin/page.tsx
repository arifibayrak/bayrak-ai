'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

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
        callbackUrl: '/dashboard/projects',
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-2">
          <h1 className="text-[28px] font-semibold leading-tight">{t('heading')}</h1>
          <p className="text-xl font-semibold mt-1">{t('subheading')}</p>
        </CardHeader>

        <CardContent>
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

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !email.trim()}
              >
                {loading ? t('sending') : t('cta')}
              </Button>

              <p className="text-sm text-muted-foreground text-center">{t('helper')}</p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
