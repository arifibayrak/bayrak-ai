import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  serverExternalPackages: ["grammy", "pg", "ws", "@neondatabase/serverless"],
  // D-61 / T-05-01: Required for next/image to optimize Vercel Blob photos (Kayıtlar tab + map popup).
  // Scope to the single Blob host only — never a bare wildcard (SSRF mitigation).
  // mapbox-gl intentionally NOT added to transpilePackages or serverExternalPackages (Research anti-pattern).
  images: {
    remotePatterns: [
      new URL("https://*.public.blob.vercel-storage.com/**"),
    ],
  },
};

export default withNextIntl(nextConfig);
