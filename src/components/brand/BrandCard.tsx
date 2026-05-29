import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * BrandCard — bayrak.ai brand-spine card primitive (D-125 flat depth,
 * rounded-md radius, border-slate-200 only, compact density).
 *
 * Does NOT wrap the heavier shadcn Card (which bakes in rounded-xl + shadow-sm
 * + auto p-4 across subcomponents); the brand layer ships its own flat
 * composition because D-125 explicitly forbids shadows on cards.
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
        "rounded-md border border-slate-200 bg-card text-card-foreground shadow-none",
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
      className={cn("p-3", className)}
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
      className={cn("p-3 border-t border-slate-200", className)}
      {...props}
    />
  );
}

export const BrandCard = Object.assign(BrandCardRoot, {
  Header: BrandCardHeader,
  Body: BrandCardBody,
  Footer: BrandCardFooter,
});
