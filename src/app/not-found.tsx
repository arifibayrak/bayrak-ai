import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { BrandEmpty, BrandButton } from "@/components/brand";

/**
 * Application 404 — single root not-found surface (RESEARCH Open Question 3
 * RESOLVED). Async server component; uses `getTranslations` from next-intl
 * server bindings to render TR/EN-localized copy from the `meta.not_found`
 * nested key block (D-123 i18n parity).
 */
export default async function NotFound() {
  const t = await getTranslations("meta.not_found");
  return (
    <BrandEmpty
      icon={<FileQuestion className="size-12 text-slate-400" />}
      title={t("title")}
      description={t("description")}
      action={
        <Link href="/dashboard/overview">
          <BrandButton variant="outline">{t("cta")}</BrandButton>
        </Link>
      }
    />
  );
}
