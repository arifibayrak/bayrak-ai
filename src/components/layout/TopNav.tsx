import Link from 'next/link';
import { Settings } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { signOut } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { LanguageToggle } from './LanguageToggle';

/**
 * Dashboard top navigation bar — Server Component.
 * Spec: sticky h-14 bg-card border-b border-border
 * Left: mobile hamburger only (sidebar is the single brand anchor)
 * Right: LanguageToggle + user email + sign-out (ghost)
 *
 * All copy via i18n keys (nav.*).
 */
export async function TopNav({ userEmail }: { userEmail: string }) {
  const locale = await getLocale();
  const t = await getTranslations('nav');
  const tAdmin = await getTranslations('dashboard.admin.nav');

  return (
    <header className="sticky top-0 z-40 h-14 bg-card border-b border-border">
      <div className="max-w-5xl mx-auto px-6 h-full flex items-center justify-between">
        {/* Left: mobile hamburger (sidebar is the single brand anchor — no duplicate wordmark here) */}
        <div className="flex items-center">
          <SidebarTrigger
            className="md:hidden text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={tAdmin('open_nav')}
          />
        </div>

        {/* Right: language toggle + settings gear + user email + sign out */}
        <div className="flex items-center gap-3">
          <LanguageToggle currentLocale={locale} />

          {/* Settings gear icon (D-86) — navigates to /dashboard/settings; no sidebar item */}
          <Link
            href="/dashboard/settings"
            className="text-muted-foreground hover:text-foreground ml-2 focus-visible:ring-2 focus-visible:ring-ring rounded-sm outline-none"
            aria-label={tAdmin('settings_aria_label')}
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </Link>

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
            <Button type="submit" variant="ghost" size="sm" className="text-foreground focus-visible:ring-ring">
              {t('sign_out')}
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
