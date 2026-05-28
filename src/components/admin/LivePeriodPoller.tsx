'use client';

/**
 * LivePeriodPoller.tsx
 *
 * D-120: 30-second polling client component for the draft hakkediş detail page.
 *
 * Closes the SDH-01 loop — the office engineer sees Telegram-approved submissions
 * land on the period detail page without a manual refresh. Mounted ONLY when the
 * period is draft (UI-side guard in [periodId]/page.tsx). The helper itself
 * (recomputeHakedisLine) ALSO re-checks status='draft' (Pitfall 4 / defense-in-depth).
 *
 * Contract (per must_haves + Test 9 pure-function assertion):
 *   - enabled === false → returns null SYNCHRONOUSLY, before any hook call.
 *     Callable as a plain function in vitest environment='node' without
 *     @testing-library/react or any DOM renderer.
 *   - enabled === true  → calls useRouter + useTranslations + useEffect, then
 *     returns the sr-only role="status" aria-live="polite" span announcing the
 *     30-second auto-refresh to screen readers.
 *
 * Rules of Hooks safety: `enabled` is stable for the lifetime of any given mount.
 * The [periodId] page conditionally MOUNTS this component as `status === 'draft' &&
 * <LivePeriodPoller enabled={true} />`. When status changes, React unmounts/remounts
 * — `enabled` does NOT flip mid-mount. The early-null branch therefore does not
 * violate the rule "hooks must run in the same order across renders of the same
 * component instance" because the branch is constant for any one instance.
 *
 * React 19 strict-mode safety (Pitfall 6): useEffect cleanup is the canonical
 * `return () => clearInterval(id)` closing over the correct mount's id. Strict-mode
 * double-mount in dev tears down and re-creates cleanly.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface LivePeriodPollerProps {
  /** Mount-gate — when false, the component renders nothing and starts no timer. */
  enabled: boolean;
  /** Poll interval in milliseconds. Default 30000 (30s) per D-120. */
  intervalMs?: number;
}

export function LivePeriodPoller({
  enabled,
  intervalMs = 30000,
}: LivePeriodPollerProps): React.ReactElement | null {
  // REVISED contract per checker Blocker 2 + must_haves: null when disabled,
  // BEFORE any hook call. This makes Test 9 a renderer-free pure-function call.
  // Safe re: Rules of Hooks because `enabled` is stable per mount instance —
  // see file header for the conditional-mount pattern in [periodId]/page.tsx.
  if (!enabled) return null;

  // The enabled branch: install the 30s polling effect and emit the sr-only
  // announcement. All hooks run unconditionally on every render where enabled
  // is true (which is always, for the lifetime of this mount instance).
  return <LivePeriodPollerEnabled intervalMs={intervalMs} />;
}

function LivePeriodPollerEnabled({
  intervalMs,
}: {
  intervalMs: number;
}): React.ReactElement {
  const router = useRouter();
  const t = useTranslations('dashboard.admin.hakedis.line_submissions');

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, router]);

  return (
    <span className="sr-only" role="status" aria-live="polite">
      {t('polling_indicator')}
    </span>
  );
}
