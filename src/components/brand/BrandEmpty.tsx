import * as React from "react";
import { cn } from "@/lib/utils";
import { BrandHeading } from "./BrandHeading";

/**
 * BrandEmpty — empty-state / 404 / error surface primitive (D-127 W1).
 *
 * Composed primitive (no shadcn equivalent). Renders a centered column with
 * optional icon (size-12 slate-400 by default — pass styled lucide icon),
 * required title, optional description, optional action (typically a
 * <BrandButton>).
 *
 * Used by `app/not-found.tsx`, `app/error.tsx`, and empty-table states.
 */
export interface BrandEmptyProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function BrandEmpty({
  icon,
  title,
  description,
  action,
  className,
}: BrandEmptyProps) {
  return (
    <div
      data-slot="brand-empty"
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 gap-3",
        className,
      )}
    >
      {icon ? <div className="mb-2">{icon}</div> : null}
      <BrandHeading as="h2" size="h2" className="text-foreground">
        {title}
      </BrandHeading>
      {description ? (
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      ) : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}
