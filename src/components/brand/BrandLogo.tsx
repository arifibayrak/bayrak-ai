import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * BrandLogo — bayrak.ai wordmark primitive (D-124).
 *
 * Renders `bayrak` + `.ai` (amber) wordmark.
 *
 * `variant` controls surface context:
 *   - "default"  → text-foreground (dark text on light surfaces, e.g. landing page)
 *   - "sidebar"  → text-sidebar-foreground (light text on graphite sidebar panel)
 *
 * The amber `.ai` suffix always uses text-primary (amber-500) for brand consistency.
 * `size` prop scales text-sm / text-base / text-2xl.
 */
export type BrandLogoSize = "sm" | "md" | "lg";
export type BrandLogoVariant = "default" | "sidebar";

const SIZE_CLASS: Record<BrandLogoSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl",
};

const VARIANT_CLASS: Record<BrandLogoVariant, string> = {
  default: "text-foreground",
  sidebar: "text-sidebar-foreground",
};

export interface BrandLogoProps {
  size?: BrandLogoSize;
  variant?: BrandLogoVariant;
  className?: string;
}

export function BrandLogo({ size = "md", variant = "default", className }: BrandLogoProps) {
  return (
    <span
      data-slot="brand-logo"
      aria-label="bayrak.ai"
      className={cn(
        SIZE_CLASS[size],
        VARIANT_CLASS[variant],
        "font-semibold tracking-tight",
        className,
      )}
    >
      <span aria-hidden="true">bayrak</span>
      <span className="text-primary" aria-hidden="true">.ai</span>
    </span>
  );
}
