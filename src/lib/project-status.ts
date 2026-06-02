/**
 * src/lib/project-status.ts — pure helpers for the Projects portfolio dashboard.
 *
 * Derives a single at-a-glance health status + progress % for a project from its
 * portfolio row. No framework imports — safe to use in RSC, client, and tests.
 *
 * Progress and value can never be summed across currencies, so the "primary"
 * currency for the headline figure is the one with the largest contracted value
 * (falling back to the one with the largest earned value if nothing is priced).
 */

export const PROJECT_STATUS = {
  NOT_STARTED: 'not_started',
  ON_TRACK: 'on_track',
  AT_RISK: 'at_risk',
  STALLED: 'stalled',
  COMPLETE: 'complete',
} as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

export type ProjectStatusInput = {
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  lastApprovedAt: string | null;
  contractedValueByCurrency: Record<string, string>;
  earnedValueByCurrency: Record<string, string>;
};

export type ProjectStatusThresholds = {
  /** Days without an approved submission before a started project is "stalled". */
  stalledDays: number;
  /** rejected / (approved + rejected) above this fraction flags "at risk". */
  rejectionRateThreshold: number;
};

export type ProjectStatusResult = {
  status: ProjectStatus;
  /** EV / BAC * 100 in the primary currency; null when nothing is priced. */
  progressPct: number | null;
  primaryCurrency: string | null;
  contractedValue: number | null;
  earnedValue: number | null;
  rejectionRate: number | null;
};

function pickPrimaryCurrency(
  contracted: Record<string, string>,
  earned: Record<string, string>,
): string | null {
  const fromContracted = Object.entries(contracted).sort(
    (a, b) => Number(b[1]) - Number(a[1]),
  )[0]?.[0];
  if (fromContracted) return fromContracted;
  const fromEarned = Object.entries(earned).sort(
    (a, b) => Number(b[1]) - Number(a[1]),
  )[0]?.[0];
  return fromEarned ?? null;
}

/**
 * deriveProjectStatus — single source of truth for a project card's status badge.
 * `now` is injected for testability (callers pass new Date()).
 */
export function deriveProjectStatus(
  row: ProjectStatusInput,
  thresholds: ProjectStatusThresholds,
  now: Date,
): ProjectStatusResult {
  const totalSubmissions = row.approvedCount + row.pendingCount + row.rejectedCount;

  const primaryCurrency = pickPrimaryCurrency(
    row.contractedValueByCurrency,
    row.earnedValueByCurrency,
  );
  const contractedValue =
    primaryCurrency != null && row.contractedValueByCurrency[primaryCurrency] != null
      ? Number(row.contractedValueByCurrency[primaryCurrency])
      : null;
  const earnedValue =
    primaryCurrency != null && row.earnedValueByCurrency[primaryCurrency] != null
      ? Number(row.earnedValueByCurrency[primaryCurrency])
      : null;
  const progressPct =
    contractedValue != null && contractedValue > 0 && earnedValue != null
      ? (earnedValue / contractedValue) * 100
      : null;

  const decided = row.approvedCount + row.rejectedCount;
  const rejectionRate = decided > 0 ? row.rejectedCount / decided : null;

  // Complete: priced project that has reached its contracted value.
  if (progressPct != null && progressPct >= 100) {
    return { status: PROJECT_STATUS.COMPLETE, progressPct, primaryCurrency, contractedValue, earnedValue, rejectionRate };
  }

  // Not started: nothing submitted yet.
  if (totalSubmissions === 0) {
    return { status: PROJECT_STATUS.NOT_STARTED, progressPct, primaryCurrency, contractedValue, earnedValue, rejectionRate };
  }

  // Stalled: work began but no approval within the configured window
  // (mirrors getStalledProjects — point-in-time, measured from `now`).
  const msPerDay = 24 * 60 * 60 * 1000;
  const lastApprovedMs = row.lastApprovedAt ? Date.parse(row.lastApprovedAt) : NaN;
  const daysSinceApproval = Number.isNaN(lastApprovedMs)
    ? Infinity
    : (now.getTime() - lastApprovedMs) / msPerDay;
  if (daysSinceApproval > thresholds.stalledDays) {
    return { status: PROJECT_STATUS.STALLED, progressPct, primaryCurrency, contractedValue, earnedValue, rejectionRate };
  }

  // At risk: rejection rate over threshold.
  if (rejectionRate != null && rejectionRate > thresholds.rejectionRateThreshold) {
    return { status: PROJECT_STATUS.AT_RISK, progressPct, primaryCurrency, contractedValue, earnedValue, rejectionRate };
  }

  return { status: PROJECT_STATUS.ON_TRACK, progressPct, primaryCurrency, contractedValue, earnedValue, rejectionRate };
}

/** Maps a status to a BrandBadge variant. */
export function projectStatusBadgeVariant(
  status: ProjectStatus,
): 'success' | 'warning' | 'destructive' | 'info' | 'neutral' {
  switch (status) {
    case PROJECT_STATUS.COMPLETE:
      return 'success';
    case PROJECT_STATUS.ON_TRACK:
      return 'info';
    case PROJECT_STATUS.AT_RISK:
      return 'warning';
    case PROJECT_STATUS.STALLED:
      return 'destructive';
    case PROJECT_STATUS.NOT_STARTED:
    default:
      return 'neutral';
  }
}
