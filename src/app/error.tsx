"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { BrandEmpty, BrandButton } from "@/components/brand";

/**
 * Application error boundary — single root error.tsx (RESEARCH Open Question 3
 * RESOLVED). Per Next.js convention, error.tsx MUST be a client component
 * (`'use client'`) — it's an interactive boundary that receives `error` and
 * `reset` props from the framework.
 *
 * Uses `useTranslations` (client hook) since `getTranslations` is server-only.
 * Renders `<BrandEmpty>` with a destructive (red-600) `TriangleAlert` icon to
 * signal severity, and a primary `<BrandButton>` calling `reset()` to retry.
 */
export default function ErrorBoundary({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("meta.error");
  return (
    <BrandEmpty
      icon={<TriangleAlert className="size-12 text-red-600" />}
      title={t("title")}
      description={t("description")}
      action={
        <BrandButton variant="primary" onClick={reset}>
          {t("cta_retry")}
        </BrandButton>
      }
    />
  );
}
