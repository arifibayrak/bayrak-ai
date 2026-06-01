import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * BrandCard — bayrak.ai brand-spine card primitive (Field-Industrial restyle 260601-kj4).
 *
 * Flat panel: bg-card, 1px hairline border-border, radius-md, shadow-none.
 * Tighter rhythm: Header p-3 / Body p-4 / Footer p-3. Hairline border between
 * header and body. No heavy shadow (D-125 flat depth).
 *
 * Used as a compound: `<BrandCard><BrandCard.Header/><BrandCard.Body/><BrandCard.Footer/></BrandCard>`.
 */
function BrandCardRoot({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="brand-card"
      className={cn(
        "rounded-md border border-border bg-card text-card-foreground shadow-none",
        className,
      )}
      {...props}
    />
  );
}

function BrandCardHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="brand-card-header"
      className={cn("p-3 border-b border-border", className)}
      {...props}
    />
  );
}

function BrandCardBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="brand-card-body"
      className={cn("p-4", className)}
      {...props}
    />
  );
}

function BrandCardFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="brand-card-footer"
      className={cn("p-3 border-t border-border", className)}
      {...props}
    />
  );
}

export const BrandCard = Object.assign(BrandCardRoot, {
  Header: BrandCardHeader,
  Body: BrandCardBody,
  Footer: BrandCardFooter,
});
