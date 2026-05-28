// ── Leaderboard sort helpers (PERF-05) ───────────────────────────────────────
//
// Pure TypeScript sort comparators + rank assigners for the People directory
// leaderboard. Originally lived in `src/actions/analytics.ts` but moved here
// because that module carries the `'use server'` directive (which forbids
// non-async exports). These helpers are synchronous by design — they sort
// already-fetched arrays in the RSC, no new SQL.
//
// Callers: people/page.tsx RSC.
//
// T-09-05-T: sortBy is mapped through a fixed option allowlist; unrecognised
// values fall through to the default (approved / turnaround) — never
// SQL-interpolated.
// RESEARCH Pitfall 3 (no-cross-currency value sort): value sort uses the first
// available currency only; when valueContributedByCurrency is empty, value = -1
// so those rows sort to the bottom (consistent with "—" display).

import type { PortfolioWorker, PortfolioAuditor } from '@/actions/analytics';

export function getWorkerSortFn(sortBy?: string): (a: PortfolioWorker, b: PortfolioWorker) => number {
  if (sortBy === 'rejected') {
    return (a, b) =>
      b.submissionsRejected - a.submissionsRejected ||
      a.displayName.localeCompare(b.displayName);
  }
  if (sortBy === 'rejection_rate') {
    return (a, b) => {
      const rateA = a.submissionsRejected / Math.max(a.submissionsApproved + a.submissionsRejected, 1);
      const rateB = b.submissionsRejected / Math.max(b.submissionsApproved + b.submissionsRejected, 1);
      return rateB - rateA || a.displayName.localeCompare(b.displayName);
    };
  }
  if (sortBy === 'value') {
    // No-cross-currency: use first available currency only; unpriced rows sort last
    return (a, b) => {
      const keysA = Object.keys(a.valueContributedByCurrency);
      const keysB = Object.keys(b.valueContributedByCurrency);
      const valA = keysA.length > 0 ? Number(a.valueContributedByCurrency[keysA[0]]) : -1;
      const valB = keysB.length > 0 ? Number(b.valueContributedByCurrency[keysB[0]]) : -1;
      return valB - valA || a.displayName.localeCompare(b.displayName);
    };
  }
  // Default: 'approved' — sort by submissionsApproved DESC, displayName ASC tiebreak
  return (a, b) =>
    b.submissionsApproved - a.submissionsApproved ||
    a.displayName.localeCompare(b.displayName);
}

export function getAuditorSortFn(sortBy?: string): (a: PortfolioAuditor, b: PortfolioAuditor) => number {
  if (sortBy === 'decisions') {
    return (a, b) =>
      b.decisionsCount - a.decisionsCount ||
      a.displayName.localeCompare(b.displayName);
  }
  if (sortBy === 'backlog') {
    return (a, b) =>
      b.pendingBacklogCount - a.pendingBacklogCount ||
      a.displayName.localeCompare(b.displayName);
  }
  if (sortBy === 'sla_breach') {
    // CR-01 (09-REVIEW): sort by slaBreachRateDecided DESC (highest breach rate = worst = rank 1).
    // null-last: auditors with null slaBreachRateDecided (no threshold or no decisions) sort to bottom.
    return (a, b) => {
      const rateA = a.slaBreachRateDecided ?? -1;
      const rateB = b.slaBreachRateDecided ?? -1;
      return rateB - rateA || a.displayName.localeCompare(b.displayName);
    };
  }
  // Default: 'turnaround' — sort by avgDecisionLatencyHours ASC (lower = faster = better)
  // null treated as Infinity (null-last when ascending)
  return (a, b) => {
    const latA = a.avgDecisionLatencyHours ?? Infinity;
    const latB = b.avgDecisionLatencyHours ?? Infinity;
    return latA - latB || a.displayName.localeCompare(b.displayName);
  };
}

/**
 * addWorkerRanks — assigns standard competition rank numbers (1,1,3) to a sorted array.
 * Rank comparison uses the same sort function used to sort the array.
 */
export function addWorkerRanks(
  sorted: PortfolioWorker[],
  sortFn: (a: PortfolioWorker, b: PortfolioWorker) => number,
): (PortfolioWorker & { rank: number })[] {
  const ranked: (PortfolioWorker & { rank: number })[] = [];
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sortFn(sorted[i], sorted[i - 1]) !== 0) {
      rank = i + 1;
    }
    ranked.push({ ...sorted[i], rank });
  }
  return ranked;
}

/**
 * addAuditorRanks — assigns standard competition rank numbers (1,1,3) to a sorted auditor array.
 */
export function addAuditorRanks(
  sorted: PortfolioAuditor[],
  sortFn: (a: PortfolioAuditor, b: PortfolioAuditor) => number,
): (PortfolioAuditor & { rank: number })[] {
  const ranked: (PortfolioAuditor & { rank: number })[] = [];
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sortFn(sorted[i], sorted[i - 1]) !== 0) {
      rank = i + 1;
    }
    ranked.push({ ...sorted[i], rank });
  }
  return ranked;
}
