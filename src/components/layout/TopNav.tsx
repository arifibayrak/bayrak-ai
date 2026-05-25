import { getLocale, getTranslations } from 'next-intl/server';
import { signOut } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { LanguageToggle } from './LanguageToggle';

/**
 * Dashboard top navigation bar — Server Component.
 * Spec: sticky h-14 bg-card border-b border-border
 * Left: bayrak.ai wordmark
 * Right: LanguageToggle + user email + sign-out (ghost)
 *
 * All copy via i18n keys (nav.*).
 */
export async function TopNav({ userEmail }: { userEmail: string }) {
  const locale = await getLocale();
  const t = await getTranslations('nav');

  return (
    <header className="sticky top-0 z-40 h-14 bg-card/80 backdrop-blur-md supports-[backdrop-filter]:bg-card/70 border-b border-border">
      <div className="max-w-5xl mx-auto px-6 h-full flex items-center justify-between">
        {/* Left: wordmark */}
        <span className="text-xl font-bold tracking-tight">{t('wordmark')}</span>

        {/* Right: language toggle + user email + sign out */}
        <div className="flex items-center gap-3">
          <LanguageToggle currentLocale={locale} />

          {userEmail && (
            <span className="text-sm text-muted-foreground hidden sm:block">
              {userEmail}
            </span>
          )}

          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/auth/signin' });
            }}
          >
            <Button type="submit" variant="ghost" size="sm">
              {t('sign_out')}
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
