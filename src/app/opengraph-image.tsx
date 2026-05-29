import { ImageResponse } from "next/og";

/**
 * Open Graph image — 1200×630 brand card with the bayrak.ai wordmark and
 * bilingual tagline. Generated dynamically via Next.js `ImageResponse` per
 * RESEARCH §Item 3 anomaly 3 + Open Question 1 RESOLVED — single source of
 * truth for the amber primary; if the brand color shifts in v3.1, the OG
 * image auto-updates.
 *
 * Per Next.js convention: `app/opengraph-image.tsx` is statically generated
 * at build time and served as `/opengraph-image` with `image/png` content-type
 * and surfaced in the document head as `<meta property="og:image">`.
 */
export const runtime = "edge";
export const alt = "bayrak.ai — Field accountability for utility-network contractors";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#f8fafc", // slate-50
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontSize: 144,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color: "#0f172a", // slate-900
            lineHeight: 1,
          }}
        >
          <span>bayrak</span>
          <span style={{ color: "#f59e0b" }}>.ai</span>
        </div>
        <div
          style={{
            marginTop: 32,
            fontSize: 32,
            color: "#334155", // slate-700
            lineHeight: 1.3,
            display: "flex",
          }}
        >
          Saha sahipleniyor · Field accountability for utility-network contractors
        </div>
      </div>
    ),
    { ...size },
  );
}
