import { ImageResponse } from "next/og";

/**
 * 32×32 favicon — amber-500 background, slate-900 `.ai` glyph.
 *
 * Per Next.js convention: `app/icon.tsx` is statically generated at build time
 * and served as `/icon` with the correct content-type. Replaces the default
 * Next.js favicon.ico for v3.0 brand pass.
 *
 * D-124 wordmark-as-mark: the amber `.ai` suffix IS the brand. A 32px square
 * cannot fit the full `bayrak.ai` wordmark — render just the high-recognition
 * `.ai` glyph on the amber brand background.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f59e0b", // amber-500 (Tailwind hex equivalent of brand --primary)
          color: "#0f172a", // slate-900
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        .ai
      </div>
    ),
    { ...size },
  );
}
