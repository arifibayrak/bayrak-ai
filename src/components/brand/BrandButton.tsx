import * as React from "react";
import { Button } from "@/components/ui/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * BrandButton — bayrak.ai brand-spine button (Phase 13 D-127 W1).
 *
 * Wraps shadcn `<Button>` and overrides its `default` variant chrome with the
 * bayrak.ai variant + size system (D-121 amber primary, D-125 rounded-md, D-126
 * icon-size scaling). The underlying shadcn Button still supplies focus-visible
 * rings, disabled treatment, and `asChild` slot.
 *
 * NO `'use client'` directive — server-renderable from any RSC. shadcn Button
 * is itself a base-ui wrapper that emits its own client boundary when needed.
 */
const brandButtonVariants = cva(
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-amber-600",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-slate-200",
        destructive: "bg-destructive text-white hover:bg-red-700",
        outline:
          "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
        ghost: "text-slate-900 hover:bg-slate-100",
      },
      size: {
        sm: "h-8 px-3 text-sm gap-1.5 [&_svg]:size-4",
        md: "h-9 px-4 text-sm gap-2 [&_svg]:size-5",
        lg: "h-10 px-5 text-base gap-2 [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type BrandButtonVariantProps = VariantProps<typeof brandButtonVariants>;

export type BrandButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "variant" | "size"
> &
  BrandButtonVariantProps;

export function BrandButton({
  variant,
  size,
  className,
  ...rest
}: BrandButtonProps) {
  return (
    <Button
      {...rest}
      className={cn(brandButtonVariants({ variant, size }), className)}
    />
  );
}

export { brandButtonVariants };
