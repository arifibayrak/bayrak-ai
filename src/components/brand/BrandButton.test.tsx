/**
 * BrandButton — pure-function contract tests.
 *
 * Vitest `environment: 'node'` per Phase 12 LivePeriodPoller pattern. NO jsdom,
 * NO @testing-library/react. We call the component as a plain function and
 * inspect the returned React element's `type` + `props.className` directly.
 *
 * Acceptance per 13-01-PLAN.md Task 3a:
 *  1. BrandButton({ children: 'Onayla' }) does not throw and returns an element
 *     whose `type` is the wrapped shadcn Button.
 *  2. variant='primary' injects a className containing `bg-primary`.
 *  3. variant='destructive' injects a className containing `bg-destructive`.
 *  4. variant='outline' injects a className containing `border-slate-300`.
 */
import { it, expect } from "vitest";
import { isValidElement } from "react";
import { BrandButton } from "./BrandButton";
import { Button as ShadcnButton } from "@/components/ui/button";

it("BrandButton: default call does not throw and renders the wrapped shadcn Button", () => {
  const el = BrandButton({ children: "Onayla" });
  expect(isValidElement(el)).toBe(true);
  // Calling the component as a function returns a ReactElement whose `type`
  // is the wrapped component. Phase 12 pure-function contract pattern.
  expect((el as { type: unknown }).type).toBe(ShadcnButton);
});

it("BrandButton variant='primary' injects bg-primary into className", () => {
  const el = BrandButton({ variant: "primary", children: "Onayla" });
  const className = (el as { props: { className?: string } }).props.className;
  expect(typeof className).toBe("string");
  expect(className).toContain("bg-primary");
});

it("BrandButton variant='destructive' injects bg-destructive into className", () => {
  const el = BrandButton({ variant: "destructive", children: "Reddet" });
  const className = (el as { props: { className?: string } }).props.className;
  expect(className).toContain("bg-destructive");
});

it("BrandButton variant='outline' injects border-slate-300 into className", () => {
  const el = BrandButton({ variant: "outline", children: "İptal" });
  const className = (el as { props: { className?: string } }).props.className;
  expect(className).toContain("border-slate-300");
});
