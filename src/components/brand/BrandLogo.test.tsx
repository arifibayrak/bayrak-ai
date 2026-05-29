/**
 * BrandLogo — pure-function contract tests.
 *
 * Vitest `environment: 'node'` per Phase 12 LivePeriodPoller pattern. NO jsdom,
 * NO @testing-library/react. We call the component as a plain function and
 * walk the returned React element tree to assert text content + class strings.
 *
 * Acceptance per 13-01-PLAN.md Task 3a:
 *  1. BrandLogo({}) does not throw; the rendered output includes the literal
 *     string `bayrak` AND the literal `.ai`.
 *  2. The `.ai` span receives className containing `text-primary` (D-124 amber).
 *  3. The `bayrak` outer text-portion has className containing `text-foreground`
 *     (slate-900 via token).
 */
import { it, expect } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { BrandLogo } from "./BrandLogo";

type ElementProps = {
  className?: string;
  children?: unknown;
};

// Recursively collect all string text nodes from a React element tree.
// Used to assert that the literal characters `bayrak` and `.ai` are present
// in the rendered output without booting a DOM renderer.
function collectText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join("");
  if (isValidElement(node)) {
    const children = (node as ReactElement).props as { children?: unknown };
    return collectText(children.children);
  }
  return "";
}

// Recursively find the first React element child whose className contains the
// given substring. Returns null if not found.
function findElementWithClass(
  node: unknown,
  needle: string,
): ReactElement | null {
  if (node == null || typeof node === "boolean") return null;
  if (typeof node === "string" || typeof node === "number") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElementWithClass(child, needle);
      if (found) return found;
    }
    return null;
  }
  if (isValidElement(node)) {
    const props = (node as ReactElement).props as ElementProps;
    if (typeof props.className === "string" && props.className.includes(needle)) {
      return node as ReactElement;
    }
    return findElementWithClass(props.children, needle);
  }
  return null;
}

it("BrandLogo: default call renders 'bayrak' and '.ai' as text", () => {
  const el = BrandLogo({});
  expect(isValidElement(el)).toBe(true);
  const text = collectText(el);
  expect(text).toContain("bayrak");
  expect(text).toContain(".ai");
});

it("BrandLogo: the '.ai' suffix span has className containing text-primary", () => {
  const el = BrandLogo({});
  // The amber `.ai` lives in a nested <span className="text-primary">.ai</span>.
  const found = findElementWithClass(el, "text-primary");
  expect(found).not.toBeNull();
  // And that nested span renders the literal `.ai` text.
  expect(collectText(found)).toBe(".ai");
});

it("BrandLogo: the outer wrapper has className containing text-foreground (slate-900 via token)", () => {
  const el = BrandLogo({}) as ReactElement;
  expect(isValidElement(el)).toBe(true);
  const className = (el.props as ElementProps).className ?? "";
  expect(className).toContain("text-foreground");
});
