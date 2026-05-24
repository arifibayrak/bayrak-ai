'use client';

import { useTranslations } from 'next-intl';

/**
 * TR|EN locale pill — client component.
 * Sets the `locale` cookie (1 year, SameSite=Lax) then reloads the page
 * so next-intl's server-side getRequestConfig picks up the new value.
 *
 * Height: 36px per UI-SPEC Language Toggle spec.
 * Keyboard accessible: aria-pressed per segment, aria-label on container.
 */
export function LanguageToggle({ currentLocale }: { currentLocale: string }) {
  const t = useTranslations('nav');

  function setLocale(locale: string) {
    document.cookie = `locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  }

  return (
    <div
      role="group"
      aria-label={t('language_toggle_label')}
      className="inline-flex items-center rounded-full overflow-hidden border border-border h-9"
    >
      <button
        type="button"
        aria-pressed={currentLocale === 'tr'}
        onClick={() => setLocale('tr')}
        className={`px-3 h-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          currentLocale === 'tr'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground hover:text-foreground'
        }`}
      >
        TR
      </button>
      <button
        type="button"
        aria-pressed={currentLocale === 'en'}
        onClick={() => setLocale('en')}
        className={`px-3 h-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          currentLocale === 'en'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground hover:text-foreground'
        }`}
      >
        EN
      </button>
    </div>
  );
}
