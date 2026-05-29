import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * BrandHeading — semantic heading primitive (D-122 Geist Sans + D-125 tight
 * tracking inherited from globals.css base layer).
 *
 * Polymorphic via `as` prop (defaults to `h2`). Always Geist Sans (inherited
 * from the html font-sans cascade — no font-* utility needed).
 */
const brandHeadingVariants = cva("tracking-tight text-foreground", {
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
