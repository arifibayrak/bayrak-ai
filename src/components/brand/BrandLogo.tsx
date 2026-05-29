import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * BrandLogo — bayrak.ai wordmark primitive (D-124).
 *
 * Renders `bayrak` in slate-900 (via text-foreground) + `.ai` in amber-500
 * (via text-primary). The amber `.ai` suffix IS the brand mark for v3.0
 * (no abstract glyph until v3.1+).
 *
 * Inherits Geist Sans from the html font-sans cascade. Weight is semibold
 * per D-124. `size` prop scales text-sm / text-base / text-2xl.
 */
export type BrandLogoSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<BrandLogoSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl",
};

export interface BrandLogoProps {
  size?: BrandLogoSize;
  className?: string;
}

export function BrandLogo({ size = "md", className }: BrandLogoProps) {
  return (
    <span
      data-slot="brand-logo"
      className={cn(
        SIZE_CLASS[size],
        "font-semibold tracking-tight text-foreground",
        className,
      )}
    >
      bayrak<span className="text-primary">.ai</span>
    </span>
  );
}
