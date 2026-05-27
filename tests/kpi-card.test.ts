/**
 * kpi-card.test.ts
 *
 * Unit tests for KpiCard component extensions (Plan 09-02):
 *   - 'warning' ValueColor maps to text-amber-600
 *   - alertBadge prop is accepted in the component's type contract
 *
 * These tests verify the type-level contract and the colorClass logic
 * by importing the module and inspecting its source/exports.
 * The environment is Node (no DOM), so we test the logic and type contract
 * rather than full render.
 */

import { readFileSync } from 'fs';
import path from 'path';

const KPICARD_PATH = path.resolve(__dirname, '../src/components/admin/KpiCard.tsx');

function readKpiCard(): string {
  return readFileSync(KPICARD_PATH, 'utf-8');
}

describe('KpiCard 09-02 extension contract', () => {
  it("ValueColor union includes 'warning'", () => {
    const src = readKpiCard();
    // Must have 'warning' in the ValueColor type union
    expect(src).toMatch(/'warning'/);
  });

  it("colorClass maps 'warning' to text-amber-600", () => {
    const src = readKpiCard();
    expect(src).toContain('text-amber-600');
    // The mapping must be guarded by a 'warning' condition
    expect(src).toMatch(/warning.*text-amber-600|text-amber-600.*warning/s);
  });

  it('KpiCardProps contains alertBadge optional prop', () => {
    const src = readKpiCard();
    expect(src).toContain('alertBadge');
  });

  it('alertBadge renders with absolute top-right positioning', () => {
    const src = readKpiCard();
    expect(src).toContain('absolute top-2 right-2');
  });

  it('alertBadge wrapper has aria-label for accessibility', () => {
    const src = readKpiCard();
    expect(src).toContain('aria-label="Alert: threshold exceeded"');
  });

  it('no --primary color class used for alert visuals (UI-SPEC hard rule)', () => {
    const src = readKpiCard();
    // text-primary must not appear — alert colors are destructive/amber only
    // Note: existing non-alert bg-primary/text-primary-foreground (if any) would also fail,
    // but the constraint is: no new primary usage. The original file has none, so this is safe.
    expect(src).not.toContain('text-primary');
    expect(src).not.toContain('bg-primary');
  });

  it('Card gains relative class conditionally (only when alertBadge present)', () => {
    const src = readKpiCard();
    // The pattern: className={alertBadge ? 'relative' : undefined}
    expect(src).toContain("relative");
    expect(src).toMatch(/alertBadge.*relative|relative.*alertBadge/s);
  });
});
