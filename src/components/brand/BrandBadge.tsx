import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * BrandBadge — bayrak.ai status pill primitive (D-121 semantic palette).
 *
 * Variants:
 *  - primary    amber-50  bg / amber-700  text (brand pill)
 *  - success    emerald   (approve)
 *  - info       sky       (informational)
 *  - warning    orange    (NOT amber — amber is reserved for brand)
 *  - destructive red      (reject / error)
 *  - neutral    slate     (default / muted)
 *
 * All variants use `rounded-full` (D-125 status-pill exception to the global
 * rounded-md rule).
 */
const brandBadgeVariants = cva(
  "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium",
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
        neutral: "bg-slate-100 text-slate-700 border border-slate-200",
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
