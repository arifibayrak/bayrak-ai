import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
} from "@/components/ui/table";

/**
 * BrandTable — dense industrial table primitive (Field-Industrial restyle 260601-kj4).
 *
 * Dense: text-sm, tight row padding py-2 px-3. Zebra-free. Sticky thead with
 * steel-100 bg + uppercase steel labels. Hairline row separators via divide-y.
 * Numeric cells: right-aligned + font-mono tabular-nums.
 *
 * Usage: `<BrandTable.Root>`, `<BrandTable.Header>`, `<BrandTable.Body>`,
 * `<BrandTable.Footer>`, `<BrandTable.Head>`, `<BrandTable.Row>`,
 * `<BrandTable.Cell>` (add `align="right"` for numeric cells).
 */

function BrandTableHead({
  className,
  ...props
}: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "py-2 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function BrandTableCell({
  className,
  align,
  ...props
}: React.ComponentProps<"td"> & { align?: "left" | "right" | "center" }) {
  return (
    <td
      className={cn(
        "py-2 px-3 text-sm",
        align === "right" && "text-right font-mono tabular-nums",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    />
  );
}

function BrandTableHeaderRow({
  className,
  ...props
}: React.ComponentProps<"thead">) {
  return (
    <thead
      className={cn("sticky top-0 bg-secondary border-b border-border", className)}
      {...props}
    />
  );
}

function BrandTableBodyRows({
  className,
  ...props
}: React.ComponentProps<"tbody">) {
  return (
    <tbody
      className={cn("divide-y divide-border", className)}
      {...props}
    />
  );
}

export const BrandTable = {
  Root: Table,
  Header: BrandTableHeaderRow,
  Body: BrandTableBodyRows,
  Footer: TableFooter,
  Head: BrandTableHead,
  Row: TableRow,
  Cell: BrandTableCell,
};
