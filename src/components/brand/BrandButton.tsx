import * as React from "react";
import { Button } from "@/components/ui/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * BrandButton — bayrak.ai brand-spine button (Field-Industrial restyle 260601-kj4).
 *
 * Wraps shadcn `<Button>` and overrides its `default` variant chrome with the
 * bayrak.ai variant + size system. Crisp 120ms transition (no scale/bounce).
 * Strong focus-visible ring using --ring (amber). radius-sm per engineered theme.
 *
 * Variant notes:
 *  - primary   : amber bg + graphite text + amber-600 hover
 *  - secondary : white panel + hairline border + graphite text
 *  - destructive: red fill
 *  - outline   : hairline border-slate-300 (test assertion preserved)
 *  - ghost     : transparent + steel hover
 *
 * NO `'use client'` directive — server-renderable from any RSC.
 */
const brandButtonVariants = cva(
  "inline-flex items-center justify-center rounded-sm font-medium transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-amber-600",
        secondary:
          "bg-card text-foreground border border-border hover:bg-secondary",
        destructive: "bg-destructive text-white hover:bg-red-700",
        outline:
          "border border-slate-300 bg-white text-foreground hover:bg-secondary",
        ghost: "text-foreground hover:bg-secondary",
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
