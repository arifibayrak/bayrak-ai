import { ImageResponse } from "next/og";

/**
 * 180×180 Apple touch icon — same amber `.ai` brand mark as icon.tsx, sized for
 * iOS/Safari home-screen and browsers that prefer apple-touch-icon. Keeps the
 * favicon consistent across every environment (favicon.ico + /icon + this).
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f59e0b", // amber-500 (brand --primary)
          color: "#0f172a", // slate-900
          fontSize: 96,
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
