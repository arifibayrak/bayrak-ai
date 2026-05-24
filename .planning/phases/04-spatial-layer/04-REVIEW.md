---
phase: 04-spatial-layer
reviewed: 2026-05-24T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/lib/spatial.ts
  - src/lib/telegram.ts
  - src/lib/bot-audit.ts
  - src/db/schema/submissions.ts
  - src/db/migrations/0003_slippery_prowler.sql
  - tests/fixtures/db.ts
  - tests/spatial.test.ts
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-05-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 4 wires the PostGIS nearest-segment snap into the worker-bot submission flow. The core spatial contract (parameterised bindings in `snapToRoute`, correct lon/lat order for `ST_MakePoint`, `::geography` cast for metre-accurate distance, best-effort D-42 guard) is implemented correctly and the mandatory D-48 coordinate-order test is present. No SQL injection surface was found in the production code path.

Two critical issues stand out: the `location` geometry column was stored without an SRID in the migration that created it (0001), meaning the snap CTE's `ST_Distance(r.geom::geography, (SELECT pt FROM sub_pt)::geography)` may silently return planar-degree distances for that column; and `ctx.from` is dereferenced without a null guard in all `bot-audit.ts` handlers, which causes a runtime crash on any channel/group callback that lacks a `from` field.

Five warning-level issues cover an asymmetric guard on `locationLat` vs `locationLon` before calling `snapToRoute`, dead outer imports in the approve block, `parseInt` returning `NaN` for an invalid `PROXIMITY_THRESHOLD_M` value, unused captured variables, and the `handleAuditDecision` approve path not clearing the auditor's UI hint on the "already resolved" toast.

---

## Critical Issues

### CR-01: `location` geometry column missing SRID 4326 in migration 0001

**File:** `src/db/migrations/0001_fixed_sunspot.sql:27`

**Issue:** The `location` geometry column that stores the worker's raw point was created as `geometry(point)` without an explicit SRID:

```sql
"location" geometry(point),
```

The Phase 4 migration (0003) correctly adds `snapped_point` as `geometry(point, 4326)`, but `location` — which is used directly by `snapToRoute` as the snap source — has no SRID. When PostGIS casts an SRID-less geometry to `::geography` (as in the `ST_Distance` call in `snapToRoute`), it may silently treat the coordinate system as SRID 0 (unknown) instead of WGS-84, producing planar-degree distances that make the 500 m threshold meaningless. This defeats the `::geography` cast that was added precisely for metre accuracy (D-10/Pitfall 2).

The `ST_SetSRID(ST_MakePoint(...), 4326)` in the snap CTE correctly stamps the _input point_ as 4326, but the `location` column SET on line 117 of `spatial.ts` inherits the column definition from the DDL — if the column has no SRID, the stored geometry loses its spatial reference.

**Fix:** Amend migration 0001 (or add a corrective statement in a new migration) to specify the SRID:

```sql
-- Option A: corrective migration (preferred — do not re-run 0001)
ALTER TABLE submissions ALTER COLUMN location TYPE geometry(point, 4326)
  USING ST_SetSRID(location, 4326);
```

Alternatively, align 0001 to match the schema definition (`geometry('location', { type: 'point', mode: 'xy', srid: 4326 })`).

---

### CR-02: `ctx.from` dereferenced without null guard in all `bot-audit.ts` handlers

**File:** `src/lib/bot-audit.ts:370, 499, 561, 569, 584, 604, 645, 656, 727, 743`

**Issue:** Every handler in `bot-audit.ts` (`handleAuditDecision`, `commitRejection`, `handleAuditReasonSelect`, `handleAuditRejectFreeText`) calls `ctx.from.id` directly without a guard. The grammY `ctx.from` is `undefined` for channel posts and certain service messages. If a malformed or channel-originated callback query reaches these handlers — which is possible because `bot.on('callback_query:data', ...)` in `telegram.ts` has no `ctx.from` guard before routing to `dispatchCallbackQuery` (line 319 only guards `telegramUserId` locally, not before the `audit:` dispatch on line 473) — a `TypeError: Cannot read properties of undefined (reading 'id')` crash will throw inside the handler.

Because the handler is async and the caller in `dispatchCallbackQuery` has no top-level try/catch, the crash will surface as an unhandled rejection and grammY will likely respond with a 500, causing Telegram to retry, leading to a crash loop.

**Fix:** Add a guard at the top of each exported handler:

```typescript
// handleAuditDecision (and commitRejection, handleAuditReasonSelect, handleAuditRejectFreeText)
if (!ctx.from) {
  await ctx.answerCallbackQuery({ text: MESSAGES.genericError, show_alert: true });
  return;
}
```

The same pattern used in `telegram.ts` lines 212 and 290 should be applied consistently here.

---

## Warnings

### WR-01: Asymmetric guard before `snapToRoute` — `locationLon` checked for empty string but `locationLat` is not

**File:** `src/lib/telegram.ts:1357`

**Issue:** The guard before calling `snapToRoute` is:

```typescript
if (data.locationLon != null && data.locationLon !== '' && data.locationLat != null) {
```

`locationLon` is checked for both `null` and empty-string, but `locationLat` is only checked for `null`. Since both values are stored identically from `location.latitude` / `location.longitude` and both are typed as `number` from grammY, the asymmetry is inconsistent and creates a latent path where `locationLat` could be an empty string (e.g., if JSONB round-trips degrade the type) and `snapToRoute` would be called with `lat = ''` cast to `number` (i.e., `NaN`), causing a PostGIS error. The best-effort catch would then silently set `no_route`, which is acceptable, but the inconsistency is a correctness risk.

**Fix:**

```typescript
if (data.locationLon != null && data.locationLon !== '' &&
    data.locationLat != null && data.locationLat !== '') {
```

---

### WR-02: `getProximityThresholdM` returns `NaN` for invalid env var, used as SQL parameter

**File:** `src/lib/spatial.ts:20`

**Issue:** `parseInt(process.env.PROXIMITY_THRESHOLD_M ?? '500', 10)` returns `NaN` if `PROXIMITY_THRESHOLD_M` is set to a non-numeric value (e.g., `"abc"`, `"500m"`). The result is then passed directly into the Drizzle `sql\`\`` template as `${threshold}` in the `CASE WHEN (SELECT dist_m FROM snap) <= ${threshold}` expression. PostgreSQL will reject a `NaN` binding with a type error, causing the snap to fail and fall through to the `no_route` fallback. The submission still persists (D-42 is not violated), but the spatial classification silently degrades to `no_route` for all submissions until the misconfiguration is noticed.

**Fix:** Add a validation fallback:

```typescript
export function getProximityThresholdM(): number {
  const parsed = parseInt(process.env.PROXIMITY_THRESHOLD_M ?? '500', 10);
  return isNaN(parsed) || parsed <= 0 ? 500 : parsed;
}
```

---

### WR-03: Dead outer imports `boqItems` and `sql` in `handleAuditDecision` approve block

**File:** `src/lib/bot-audit.ts:399-400`

**Issue:** Inside the `if (action === 'approve')` block, two imports are declared at the outer scope of the block but never used there:

```typescript
const { boqItems } = await import('@/db/schema/boq-items');  // line 399 — unused
const { sql } = await import('drizzle-orm');                  // line 400 — unused
```

The actual `boq2` and `sql2` aliases are re-imported inside the `txDb.transaction(async (tx) => {})` closure (lines 411–412) and are used there. The outer `boqItems` and `sql` declarations are dead code — they trigger unnecessary dynamic `import()` calls on every approve tap, add noise, and mask the intent.

**Fix:** Remove lines 399 and 400 from `handleAuditDecision`.

---

### WR-04: Dead variables `approvedQuantity` and `boqItemId` in `handleAuditDecision`

**File:** `src/lib/bot-audit.ts:404-405, 434-435`

**Issue:** The outer variables declared before the transaction:

```typescript
let approvedQuantity: string | number = 0;
let boqItemId = '';
```

are written inside the transaction closure (lines 434–435) but never read after the `try/catch` block ends. The values are unused post-commit. This indicates either dead scaffolding that was never cleaned up, or missing functionality (e.g., the post-commit caption for the worker was originally intended to include the quantity/boqItemId but that logic was not wired in).

**Fix:** Remove both variable declarations and their assignments inside the closure. Use `affected[0].boqItemId` directly in the `boq2` update (already done at line 443) and drop the outer bindings.

---

### WR-05: `handleAuditDecision` approve path does not call `answerCallbackQuery` with a success toast before returning

**File:** `src/lib/bot-audit.ts:447, 488`

**Issue:** On the `AlreadyResolvedError` path (line 447), `answerCallbackQuery` is called correctly. But on the success path, the function returns at line 488 after `editAllSiblingMessages` and the worker notification, without ever calling `ctx.answerCallbackQuery()`. The initial `answerCallbackQuery()` in `telegram.ts` line 316 is called with no text (empty toast) at the top of every callback to clear Telegram's spinner, so this is not a broken UX — but it means the approve path provides no positive feedback to the auditor's UI beyond the sibling message edits, which may lag. This is a latent UX regression risk if the generic `answerCallbackQuery()` at line 316 is ever removed or conditioned.

**Fix:** Add a success toast before returning:

```typescript
// at the end of the approve path, before `return`
await ctx.answerCallbackQuery({ text: MESSAGES.auditApprovedToast ?? '✅ Onaylandı' });
return;
```

---

## Info

### IN-01: Migration 0001 `location` column SRID note should be documented in migration header

**File:** `src/db/migrations/0001_fixed_sunspot.sql:27`

**Issue:** The Phase 4 migration header (0003) explicitly documents that the SRID was added manually because drizzle-kit emits geometry without SRID. The same situation applies to the `location` column in 0001 (emitted as `geometry(point)` without `4326`). There is no corresponding note in 0001's header, creating a maintenance hazard — the next engineer running drizzle-kit generate will not know to check 0001.

**Fix:** Add a comment to 0001 noting the missing SRID and the corrective migration.

---

### IN-02: Dead import of `boqItems` and `sql` at `bot-audit.ts:399-400` also signals a possible missing post-commit notification feature

**File:** `src/lib/bot-audit.ts:404`

**Issue:** `approvedQuantity` (line 434) is captured but never used in the post-commit path. The auditor caption built in `editAllSiblingMessages` receives `MESSAGES.auditApprovedOutcome(auditorDisplayName)` without the approved quantity. This may be intentional, but the captured variable suggests the outcome caption was originally designed to include the quantity (consistent with `auditRejectedOutcome` which includes the `reason`). No functionality is broken, but the pattern is inconsistent.

**Fix:** Either use `approvedQuantity` in `auditApprovedOutcome` or remove it.

---

### IN-03: `truncateAllTables` in `tests/fixtures/db.ts` uses `sql.raw` with a hard-coded table list — `routes` table not present before Phase 4 is not handled in the fallback

**File:** `tests/fixtures/db.ts:65-66`

**Issue:** The `routes` table is included in the full `tables` list (line 65) but the phase-2-only fallback list (line 97) only excludes `audit_notifications`. If the test environment has `audit_notifications` but not `routes` (e.g., Phase 3 DB without Phase 4 migration applied), the full-list truncation succeeds but the partial fallback would still fail on `routes`. The fallback comment says "Phase 3 table hasn't been migrated yet" but does not account for Phase 4 tables. This is a test-reliability issue for a mixed-phase environment.

**Fix:** Either extend the fallback logic to handle Phase 4 tables, or document that the fallback only covers the Phase 3 gap and a separate fallback for Phase 4 may be needed.

---

_Reviewed: 2026-05-24T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
