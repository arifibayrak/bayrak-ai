import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

/**
 * BrandTable — thin namespaced wrapper around shadcn Table primitives.
 *
 * Per RESEARCH Open Question 2 RESOLVED: stays a thin wrapper for W1; density
 * bake-in deferred to a future phase if W2 review surfaces 3+ repeats.
 *
 * The underlying shadcn `Table` already sets `w-full caption-bottom text-sm`,
 * which is the compact-density default Phase 8–12 surfaces use. No additional
 * density classes baked in here.
 *
 * Usage: `<BrandTable.Root>`, `<BrandTable.Header>`, `<BrandTable.Body>`,
 * `<BrandTable.Footer>`, `<BrandTable.Head>`, `<BrandTable.Row>`,
 * `<BrandTable.Cell>`.
 */
export const BrandTable = {
  Root: Table,
  Header: TableHeader,
  Body: TableBody,
  Footer: TableFooter,
  Head: TableHead,
  Row: TableRow,
  Cell: TableCell,
};
