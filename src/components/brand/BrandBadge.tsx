import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * BrandBadge — bayrak.ai industrial chip primitive (Field-Industrial restyle 260601-kj4).
 *
 * Squared-off chips: radius-sm, uppercase text-[11px] tracking-wide font-semibold,
 * 1px border, tonal bg. Variant names preserved (no prop API change).
 *
 * Variants:
 *  - primary    amber tonal (brand / hi-vis accent)
 *  - success    emerald     (approve)
 *  - info       sky         (informational)
 *  - warning    orange      (NOT amber — amber is reserved for brand)
 *  - destructive red        (reject / error)
 *  - neutral    steel       (default / muted)
 */
const brandBadgeVariants = cva(
  "inline-flex items-center justify-center rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
  {
    variants: {
      variant: {
        primary: "bg-amber-50 text-amber-700 border border-amber-200",
        success:
          "bg-emerald-50 text-emerald-700 border border-emerald-200",
        info: "bg-sky-50 text-sky-700 border border-sky-200",
        warning:
          "bg-orange-50 text-orange-700 border border-orange-200",
        destructive: "bg-red-50 text-red-700 border border-red-200",
        neutral: "bg-secondary text-muted-foreground border border-border",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export type BrandBadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof brandBadgeVariants>;

export function BrandBadge({
  variant,
  className,
  ...props
}: BrandBadgeProps) {
  return (
    <span
      data-slot="brand-badge"
      className={cn(brandBadgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { brandBadgeVariants };
