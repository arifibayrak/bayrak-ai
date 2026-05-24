import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  // Default to Turkish per I18N-02; fall back to 'tr' if no cookie set
  const locale = cookieStore.get("locale")?.value ?? "tr";

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
