import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * BrandHeading — semantic heading primitive (Field-Industrial restyle 260601-kj4).
 *
 * Polymorphic via `as` prop (defaults to `h2`). Uses Space Grotesk display type
 * via `font-heading` class (bound to --font-heading CSS variable in globals).
 * Tight tracking per engineering style. Display size uses .text-display utility.
 */
const brandHeadingVariants = cva("font-heading tracking-tight text-foreground", {
  variants: {
    size: {
      display: "text-4xl font-bold",
      h1: "text-2xl font-bold",
      h2: "text-xl font-semibold",
      h3: "text-lg font-semibold",
    },
  },
  defaultVariants: { size: "h2" },
});

export type BrandHeadingProps = React.HTMLAttributes<HTMLHeadingElement> &
  VariantProps<typeof brandHeadingVariants> & {
    as?: "h1" | "h2" | "h3" | "h4";
  };

export function BrandHeading({
  as: As = "h2",
  size,
  className,
  ...props
}: BrandHeadingProps) {
  return (
    <As
      className={cn(brandHeadingVariants({ size }), className)}
      {...props}
    />
  );
}

export { brandHeadingVariants };
