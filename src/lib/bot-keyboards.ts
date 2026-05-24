/**
 * src/lib/bot-keyboards.ts
 *
 * Pure keyboard builder functions for the worker Telegram bot (D-23, D-24).
 *
 * PURE MODULE — no DB calls, no ctx references, no async. Receives data in,
 * returns InlineKeyboard out. Fully unit-testable in isolation.
 *
 * D-23: paginated inline keyboard (~6 per page, ‹ › navigation)
 * D-24: each BOQ option shows remaining balance, e.g. "Boru — 320/500 m kaldı"
 */

import { InlineKeyboard } from 'grammy';
import { remainingBalance } from '@/lib/boq-balance';

// ---------------------------------------------------------------------------
// Page size (D-23 — planner choice within 6-8)
// ---------------------------------------------------------------------------

const PAGE_SIZE = 6;

// ---------------------------------------------------------------------------
// Structural types (minimal — only the fields used by builders)
// ---------------------------------------------------------------------------

/** Minimal BOQ item shape required by buildBoqKeyboard (matches boqItems row) */
export interface BoqItemForKeyboard {
  id: string;
  material: string;
  unit: string;
  plannedQty: string | number;
  approvedQty: string | number;
}

/** Minimal project shape required by buildProjectKeyboard */
export interface ProjectForKeyboard {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// BOQ keyboard builder
// ---------------------------------------------------------------------------

/**
 * buildBoqKeyboard — returns a paginated InlineKeyboard for BOQ item selection.
 *
 * Each item button shows its remaining balance (D-24):
 *   "<material> — <remaining>/<planned> <unit> kaldı"
 * Select callback_data: `boq:select:<id>`
 * Navigation callback_data: `boq:page:<n>`
 *
 * @param items  - Full list of BOQ items for the project
 * @param page   - Zero-based page index
 * @returns InlineKeyboard with PAGE_SIZE items + prev/next navigation
 */
export function buildBoqKeyboard(
  items: BoqItemForKeyboard[],
  page: number
): InlineKeyboard {
  const start = page * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);
  const kb = new InlineKeyboard();

  for (let i = 0; i < pageItems.length; i++) {
    const item = pageItems[i];
    const remaining = remainingBalance(item.plannedQty, item.approvedQty);
    const label = `${item.material} — ${remaining}/${item.plannedQty} ${item.unit} kaldı`;
    kb.text(label, `boq:select:${item.id}`);
    // Add row separator after each item except the last — the nav logic below
    // either starts a new row or we end cleanly without a trailing empty row.
    if (i < pageItems.length - 1) kb.row();
  }

  // Navigation row — only add when there are adjacent pages
  const hasPrev = page > 0;
  const hasNext = (page + 1) * PAGE_SIZE < items.length;

  if (hasPrev || hasNext) {
    kb.row(); // terminate item rows before nav
    if (hasPrev) kb.text('‹ Önceki', `boq:page:${page - 1}`);
    if (hasNext) kb.text('Sonraki ›', `boq:page:${page + 1}`);
  }

  return kb;
}

// ---------------------------------------------------------------------------
// Project keyboard builder
// ---------------------------------------------------------------------------

/**
 * buildProjectKeyboard — returns a paginated InlineKeyboard for project selection.
 *
 * Reuses the same pagination pattern as buildBoqKeyboard (D-23).
 * Select callback_data: `project:select:<id>`
 * Navigation callback_data: `project:page:<n>`
 *
 * @param projects - Full list of projects assigned to the worker
 * @param page     - Zero-based page index
 * @returns InlineKeyboard with PAGE_SIZE projects + prev/next navigation
 */
export function buildProjectKeyboard(
  projects: ProjectForKeyboard[],
  page: number
): InlineKeyboard {
  const start = page * PAGE_SIZE;
  const pageProjects = projects.slice(start, start + PAGE_SIZE);
  const kb = new InlineKeyboard();

  for (let i = 0; i < pageProjects.length; i++) {
    const project = pageProjects[i];
    kb.text(project.name, `project:select:${project.id}`);
    if (i < pageProjects.length - 1) kb.row();
  }

  // Navigation row
  const hasPrev = page > 0;
  const hasNext = (page + 1) * PAGE_SIZE < projects.length;

  if (hasPrev || hasNext) {
    kb.row(); // terminate project rows before nav
    if (hasPrev) kb.text('‹ Önceki', `project:page:${page - 1}`);
    if (hasNext) kb.text('Sonraki ›', `project:page:${page + 1}`);
  }

  return kb;
}
