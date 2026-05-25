import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { buttonVariants } from '@/components/ui/button';

/**
 * Landing page header — sticky top bar with wordmark, language toggle, and primary CTA.
 * Mirrors TopNav structure but is scoped to the public landing page only.
 * Server Component — no 'use client'.
 */
export async function LandingHeader() {
  const locale = await getLocale();
  const t = await getTranslations('landing');

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-border bg-card/80 backdrop-blur-md supports-[backdrop-filter]:bg-card/70">
      <div className="max-w-5xl mx-auto px-6 h-full flex items-center justify-between">
        {/* Wordmark */}
        <span className="text-xl font-bold tracking-tight">
          bayrak<span className="text-primary">.ai</span>
        </span>

        {/* Right controls */}
        <div className="flex items-center gap-3">
          <LanguageToggle currentLocale={locale} />
          <Link href="/auth/signin" className={buttonVariants({ size: 'lg' })}>
            {t('hero.cta_primary')}
          </Link>
        </div>
      </div>
    </header>
  );
}
