import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

const SUPPORTED_LOCALES = ['tr', 'en'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(v: string | undefined): v is SupportedLocale {
  return SUPPORTED_LOCALES.includes(v as SupportedLocale);
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  // Default to Turkish per I18N-02; validate cookie value against allowlist before use in import path
  const raw = cookieStore.get("locale")?.value;
  const locale: SupportedLocale = isSupportedLocale(raw) ? raw : 'tr';

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
