---
phase: 13-ux-brand-pass
fixed_at: 2026-05-29T00:00:00Z
review_path: .planning/phases/13-ux-brand-pass/13-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 13: Code Review Fix Report

**Fixed at:** 2026-05-29T00:00:00Z
**Source review:** .planning/phases/13-ux-brand-pass/13-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (1 critical + 6 warnings; Info findings excluded by `critical_warning` scope)
- Fixed: 7
- Skipped: 0

All fixes were applied inside an isolated git worktree (`gsd-reviewfix/13-75014`), committed atomically, and fast-forwarded onto `main`. A `node_modules` symlink was temporarily created in the worktree purely to let `tsc` resolve modules; it is gitignored and was removed before cleanup (never committed).

## Fixed Issues

### CR-01: Auth-error page collapses both error branches to identical copy

**Files modified:** `src/app/auth/error/page.tsx`, `messages/en.json`, `messages/tr.json`
**Commit:** a828fb7
**Status:** fixed: requires human verification (auth-flow / branch-discrimination logic)
**Applied fix:**
- Narrowed `isAccessDenied` to `!errorType || errorType === 'AccessDenied'` so the `Verification` (expired/used magic-link) case no longer collapses into the allowlist-block message.
- Wired the non-access-denied ternary arm to a new key `t('error_link_invalid')`.
- Added `auth.signin.error_link_invalid` to both `en.json` ("This sign-in link is invalid or has expired. Request a new one.") and `tr.json` ("Bu giriş bağlantısı geçersiz veya süresi dolmuş. Yeni bir bağlantı isteyin."). Verified i18n key parity (9 keys each side, both contain the new key).
- Corrected the stale `// Client component for i18n translations` comment to `// Server component — next-intl useTranslations is server-bound in next-intl v4` (also resolves IN-01).

_Human-verify note:_ confirm the access-denied vs. link-invalid branch mapping matches the intended Auth.js error semantics for your magic-link flow.

### WR-01: Dead translation props threaded into EVTableClient

**Files modified:** `src/app/dashboard/(admin)/overview/EVTableClient.tsx`, `src/app/dashboard/(admin)/overview/page.tsx`
**Commit:** acbaf14
**Applied fix:** Removed `tChartNoData` and `tChartThroughput` from `EVTableClientProps`, from the destructure, and from the `OverviewPage` call site. Confirmed zero remaining references; full project `tsc --noEmit` clean.

### WR-02: Unused `ResponsiveContainer` import in TrendChartsClient

**Files modified:** `src/components/admin/TrendChartsClient.tsx`
**Commit:** eeeb663
**Applied fix:** Deleted `ResponsiveContainer,` from the recharts import block. Confirmed no remaining references; typecheck clean.

### WR-03: No-op expression used to suppress an unused-variable warning

**Files modified:** `src/app/dashboard/(admin)/people/[personId]/page.tsx`
**Commit:** 9e88d42
**Applied fix:** Removed the dead `workerTotal` declaration and the `{workerTotal > -1 && null}` no-op JSX. Also removed `workerPending`, which the review-targeted removal left orphaned (its only remaining consumer was `workerTotal`) — eliminating the smell rather than relocating it. `workerApproved`/`workerRejected` remain (still used in 9 places). Typecheck clean.

### WR-04: Unvalidated `status` string cast to a closed union in three places

**Files modified:** `src/components/admin/HakedisStatusBadge.tsx`, `src/app/dashboard/(admin)/exports/page.tsx`, `src/app/dashboard/(admin)/hakedis/page.tsx`, `src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx`
**Commit:** ce83f84
**Status:** fixed: requires human verification (the `[periodId]` page's unknown-status fallback affects control-flow gating)
**Applied fix:**
- Made `HakedisStatusBadge` tolerant: it now accepts `status: string`, and an unknown value renders a `neutral` `BrandBadge` with the raw string as label (no missing-key throw, no `undefined` variant).
- Exported a `HakedisStatus` type and an `asHakedisStatus(s): HakedisStatus | null` allowlist guard mirroring `records/page.tsx`'s `parseStatus`.
- `exports/page.tsx` and `hakedis/page.tsx`: dropped the `as 'draft' | ...` casts and pass the raw `period.status` directly to the now-tolerant badge.
- `hakedis/[periodId]/page.tsx`: replaced the unguarded cast. The badge receives the raw string (`rawStatus`); the control-flow value (`status`, fed to `PeriodDetailControls` and `=== 'draft'` gates) is `asHakedisStatus(rawStatus) ?? 'finalized'` — an unknown status falls back to the conservative read-only (non-draft) path rather than enabling the draft poller/finalize actions.

_Human-verify note:_ confirm `'finalized'` is the desired conservative fallback for an unrecognized status on the period-detail page (it suppresses the 30s poller and draft-only controls).

### WR-05: `hasMore` pagination uses `>=` instead of `>`, can show a phantom "Load more"

**Files modified:** `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx`
**Commit:** b2f8b75
**Status:** fixed: requires human verification (pagination boundary logic)
**Applied fix:** Adopted the `records/page.tsx` lookahead pattern — fetch `limit + 1` rows, set `hasMore = fetched.length > limit`, slice to `limit` for display (`entries`). The render guard now uses `hasMore` instead of the inline `entries.length >= limit` (eliminating the previously-dead `hasMore` const too). Typecheck clean.

_Human-verify note:_ confirm a "Load more" click correctly advances when the total activity count is an exact multiple of `INITIAL_LIMIT` (50) and that the button disappears at the true end of data.

### WR-06: `EVTableClient` empty-state and per-currency dash logic can mismatch

**Files modified:** `src/app/dashboard/(admin)/overview/EVTableClient.tsx`
**Commit:** c37c7dd
**Applied fix:** Added a single `hasUsableCurrencyData(project, currency)` predicate (backed by `isUsableValue`, which rejects `undefined`/empty/`NaN` after `parseFloat`). Both the page-level empty-state (`hasAnyProjectData`) and the per-row dash branch (`hasCurrencyData`) now call it, so "has a key" and "has a usable value" can no longer diverge. Typecheck clean.

## Skipped Issues

None — all in-scope findings were fixed.

Out-of-scope (not attempted under `critical_warning` scope): IN-01 (incidentally resolved as part of CR-01), IN-02, IN-03, IN-04, IN-05.

---

_Fixed: 2026-05-29T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
