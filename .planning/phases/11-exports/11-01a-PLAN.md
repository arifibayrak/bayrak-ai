---
phase: 11-exports
plan: 01a
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - public/fonts/DejaVuSans.ttf
  - public/fonts/DejaVuSans-Bold.ttf
  - src/db/schema/office-activity-log.ts
  - src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx
  - messages/en.json
  - messages/tr.json
autonomous: false
requirements: [EXP-01, EXP-02, EXP-03, EXP-04]
user_setup: []

must_haves:
  truths:
    - "D-106: DejaVu Sans TTF (regular + bold) exists at public/fonts/ and is >100KB each"
    - "D-105: @react-pdf/renderer 4.5.1 installed; auto-externalized — no next.config.ts change"
    - "D-109: OFFICE_ACTION_TYPES extended with the 4 new export action types (text column, NO migration)"
    - "D-109 traceability: OE Scorecard actionTypeToKey() map gains the 4 new entries up-front (Plan 11-06's OE-scorecard change was hoisted here so that any office_activity_log row written by later plans renders the specific label, not 'action_unknown')"
    - "messages/{en,tr}.json each gain the 4 action_*_exported keys under oe_scorecard so the actionTypeToKey() entries resolve"
    - "pdf-parse devDependency installed for binary PDF content assertions"
  artifacts:
    - path: "package.json"
      provides: "@react-pdf/renderer + dejavu-fonts-ttf + pdf-parse dependency declarations"
      contains: '"@react-pdf/renderer"'
    - path: "public/fonts/DejaVuSans.ttf"
      provides: "Regular TTF font for D-106 PDF rendering"
    - path: "public/fonts/DejaVuSans-Bold.ttf"
      provides: "Bold TTF font for D-106 PDF heading rendering"
    - path: "src/db/schema/office-activity-log.ts"
      provides: "OFFICE_ACTION_TYPES const with 4 export action types appended"
      contains: "submission_ledger_exported"
    - path: "src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx"
      provides: "actionTypeToKey() map extended with 4 new D-109 action types"
      contains: "hakedis_pdf_exported"
    - path: "messages/en.json"
      provides: "4 action_*_exported keys under oe_scorecard"
    - path: "messages/tr.json"
      provides: "Turkish parity for the 4 action_*_exported keys"
  key_links:
    - from: "src/db/schema/office-activity-log.ts"
      to: "src/lib/log-office-activity.ts"
      via: "OfficeActionType union type"
      pattern: "OFFICE_ACTION_TYPES"
    - from: "src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx"
      to: "messages/{en,tr}.json action_*_exported keys"
      via: "actionTypeToKey() returns the i18n key consumed by t(key)"
      pattern: "action_hakedis_(pdf|excel)_exported"
---

<objective>
Wave 1 setup half-A for Phase 11. Installs the three new packages (@react-pdf/renderer, dejavu-fonts-ttf, plus pdf-parse devDep), copies DejaVu Sans TTF files into public/fonts/, extends OFFICE_ACTION_TYPES with the four export action types (D-109, TypeScript-only — no DB migration), hoists the OE Scorecard `actionTypeToKey()` map extension from the old Plan 11-06 here (so that any office_activity_log row written downstream renders the specific label), and adds the 4 matching `action_*_exported` i18n keys to both messages/{en,tr}.json so that hoisted map entry actually resolves.

Purpose: This is the package-install + schema/i18n side of the Wave 1 split. Plan 11-01b follows immediately in the same wave and ships the shared helper code (toSlug, sanitizeExcelCell, getAllFinishedPeriods + locationCompliance extension, exports.* i18n namespace, test scaffold). The split exists because checker review found the combined 6-task plan exceeded the 3-task threshold — splitting also lets the package-legitimacy checkpoint live cleanly at the top of its own plan.

Output: 1 npm install, 2 TTF files in public/fonts/, 3 TypeScript additions (OFFICE_ACTION_TYPES extension, actionTypeToKey() map extension, 4 i18n action keys per locale).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/11-exports/11-CONTEXT.md
@.planning/phases/11-exports/11-RESEARCH.md
@.planning/phases/11-exports/11-VALIDATION.md
@CLAUDE.md

<interfaces>
<!-- Existing exports referenced by Wave 2 plans. Extracted from codebase. -->

From src/db/schema/office-activity-log.ts (line 8-25, EXTEND in this plan):
```typescript
export const OFFICE_ACTION_TYPES = [
  'project_created', 'project_updated', 'project_deleted',
  'boq_item_created', 'boq_item_updated', 'boq_item_deleted',
  'boq_imported', 'unit_price_set', 'route_uploaded',
  'person_approved', 'person_assigned', 'person_unassigned',
  'hakedis_period_created', 'hakedis_period_finalized', 'hakedis_period_deleted',
  'hakedis_exported',
] as const;
// ← APPEND four new strings here (D-109): hakedis_pdf_exported,
//   hakedis_excel_exported, submission_ledger_exported, performance_summary_exported.
export type OfficeActionType = (typeof OFFICE_ACTION_TYPES)[number];
// text column — adding values is TypeScript-only; NO migration.
```

From src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx (lines 49-71, EXTEND in this plan):
```typescript
function actionTypeToKey(actionType: string): string {
  const map: Record<string, string> = {
    project_created: 'action_project_created',
    // ... existing 15 entries ...
    // ← APPEND 4 D-109 entries here.
  };
  return map[actionType] ?? 'action_unknown';
}
```

From src/lib/log-office-activity.ts (Phase 7):
```typescript
export function logOfficeActivity(params: {
  actorUserId: string;
  actionType: OfficeActionType;
  entityType: string;
  entityId?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
}): void;  // fire-and-forget via after() — never await
```
</interfaces>

@src/db/schema/office-activity-log.ts
@src/lib/log-office-activity.ts
@src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx
@messages/en.json
@messages/tr.json
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking-human">
  <name>Task 0: Package legitimacy gate — @react-pdf/renderer + dejavu-fonts-ttf + pdf-parse</name>
  <read_first>
    - .planning/phases/11-exports/11-RESEARCH.md (## Package Legitimacy Audit + ## Standard Stack)
  </read_first>
  <what-built>Per the research Package Legitimacy Audit, three new dependencies are pending install. slopcheck was unavailable at research time; both runtime packages are tagged [ASSUMED]. Human verification is required before npm install per Phase 11 planning context (`<threat_model>` — T-11-SC, supply-chain mitigation).</what-built>
  <how-to-verify>
    1. Open https://www.npmjs.com/package/@react-pdf/renderer — confirm: maintained by `diegomura` / org, latest version is 4.5.x, >100k weekly downloads, MIT license, last publish within last 90 days, GitHub repo `diegomura/react-pdf` is alive.
    2. Open https://www.npmjs.com/package/dejavu-fonts-ttf — confirm: package contains only `.ttf` font files (no postinstall script — check `package.json` files list), MIT-style font license, last publish is old (acceptable since the font files are static assets — DejaVu Sans is an established Latin Extended-A font widely shipped in OS distributions).
    3. Open https://www.npmjs.com/package/pdf-parse — confirm: actively maintained, >1M weekly downloads, used only as a devDependency for binary PDF text-extraction assertions in tests.
    4. If anything looks suspicious (unmaintained, unexpected dependencies, postinstall scripts on dejavu-fonts-ttf), STOP and report.
  </how-to-verify>
  <resume-signal>Type "approved" to allow Task 1 (npm install) to proceed, OR describe the issue and the planner will route around the package.</resume-signal>
</task>

<task type="auto" tdd="false">
  <name>Task 1: Install dependencies + copy DejaVu TTFs into public/fonts/</name>
  <read_first>
    - package.json (lines 1-80; confirm exceljs is already present)
    - .planning/phases/11-exports/11-RESEARCH.md (## Standard Stack table + Pitfall 4 WOFF2 + Pitfall 6 runtime)
  </read_first>
  <files>package.json, package-lock.json, public/fonts/DejaVuSans.ttf, public/fonts/DejaVuSans-Bold.ttf</files>
  <action>
    Run `npm install @react-pdf/renderer@4.5.1 dejavu-fonts-ttf@2.37.3` (per D-105 + D-106 — pinned versions verified in research) and `npm install -D pdf-parse@1.1.1` (devDependency — for tests/exports.test.ts binary content assertions).

    After the install completes, locate `node_modules/dejavu-fonts-ttf/ttf/` and copy `DejaVuSans.ttf` → `public/fonts/DejaVuSans.ttf` and `DejaVuSans-Bold.ttf` → `public/fonts/DejaVuSans-Bold.ttf`. If `public/fonts/` does not exist, create it. Use `cp`, not symlinks — Vercel serverless functions need the file physically present in the bundle (research Assumption A3).

    Do NOT edit next.config.ts. Per research, @react-pdf/renderer is on Next.js 15's automatic `serverExternalPackages` opt-out list (A1). Adding it manually would be redundant. Confirm `next.config.ts` already lists `["grammy", "pg", "ws", "@neondatabase/serverless"]` — leave that array untouched.
  </action>
  <verify>
    <automated>node_modules/.bin/tsc --noEmit 2>&amp;1 | head -5; ls -la public/fonts/DejaVuSans.ttf public/fonts/DejaVuSans-Bold.ttf; node -e "const f=require('fs').statSync('public/fonts/DejaVuSans.ttf'); process.exit(f.size > 100000 ? 0 : 1)"</automated>
  </verify>
  <acceptance_criteria>
    - `public/fonts/DejaVuSans.ttf` exists and is >100 KB (DejaVu Sans regular is ~750 KB).
    - `public/fonts/DejaVuSans-Bold.ttf` exists and is >100 KB.
    - `package.json` dependencies includes `@react-pdf/renderer` at `^4.5.1` and `dejavu-fonts-ttf` at `^2.37.3`.
    - `package.json` devDependencies includes `pdf-parse` at `^1.1.1`.
    - `next.config.ts` `serverExternalPackages` array UNCHANGED from prior content (auto-externalize handles react-pdf per Pitfall 1 + A1).
    - `npx tsc --noEmit` shows no new errors from the installs.
    - The verify automation gating on TTF size (>100 KB) is mandatory — load-bearing for Plan 11-04 T-11-04-FONT-MISSING (registerFonts try/catch references this exact precondition).
  </acceptance_criteria>
  <done>3 packages installed at exact pinned versions; 2 TTFs in public/fonts/ each >100 KB; tsc clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Extend OFFICE_ACTION_TYPES (D-109) + hoist OE Scorecard actionTypeToKey() map + i18n action keys</name>
  <read_first>
    - src/db/schema/office-activity-log.ts (lines 1-49)
    - src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx (lines 49-71 — actionTypeToKey function)
    - messages/en.json (lines 219-249 oe_scorecard block)
    - messages/tr.json (parallel structure)
    - .planning/phases/11-exports/11-CONTEXT.md (D-109 paragraph)
    - .planning/phases/11-exports/11-RESEARCH.md (Pattern 4: Activity Log Extension)
  </read_first>
  <files>src/db/schema/office-activity-log.ts, src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx, messages/en.json, messages/tr.json</files>
  <action>
    Three atomic edits across four files. All four edits MUST land before this task is considered done — partial state would leave the OE scorecard showing 'action_unknown' for the new types if the activity log were written before the i18n keys exist.

    **Edit 1 — `src/db/schema/office-activity-log.ts`:**

    Append four new strings to the `OFFICE_ACTION_TYPES` const tuple in this order: `'hakedis_pdf_exported'`, `'hakedis_excel_exported'`, `'submission_ledger_exported'`, `'performance_summary_exported'`. Keep them after the existing `'hakedis_exported'` entry, preserving the `as const` annotation. The column is `text('action_type').notNull()` — extending an `as const` tuple is a compile-time-only change; do NOT create a migration file, do NOT run drizzle-kit generate, do NOT touch the migrations folder. Per the planning context `<no_schema_migration>` block, any `[BLOCKING]` schema-push task in Phase 11 is invalid and will be rejected at review.

    Do not modify the `OfficeActionType` type export — TypeScript infers it from the tuple automatically.

    **Edit 2 — `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx`:**

    Inside the `actionTypeToKey` function's `map` object (currently lines 53-69), append four entries AFTER the existing `boq_item_created` line and BEFORE the closing `};`:

    ```
    hakedis_pdf_exported: 'action_hakedis_pdf_exported',
    hakedis_excel_exported: 'action_hakedis_excel_exported',
    submission_ledger_exported: 'action_submission_ledger_exported',
    performance_summary_exported: 'action_performance_summary_exported',
    ```

    Do NOT modify any other part of the file. Do NOT change the function signature, the `Record<string, string>` typing, or the fallback `action_unknown`. (This edit was previously in old Plan 11-06; hoisted here so that the moment Wave 2 starts writing office_activity_log rows, the scorecard renders specific labels rather than the generic fallback.)

    **Edit 3 — `messages/en.json` and `messages/tr.json`:**

    Under `dashboard.admin.oe_scorecard` (after the existing `action_unknown` entry in each file): add 4 new keys.

    EN (`messages/en.json`):
    - `"action_hakedis_pdf_exported": "Downloaded hakkediş PDF"`
    - `"action_hakedis_excel_exported": "Downloaded hakkediş Excel"`
    - `"action_submission_ledger_exported": "Exported submission ledger"`
    - `"action_performance_summary_exported": "Exported performance summary"`

    TR (`messages/tr.json`):
    - `"action_hakedis_pdf_exported": "Hakkediş PDF'i indirildi"`
    - `"action_hakedis_excel_exported": "Hakkediş Excel'i indirildi"`
    - `"action_submission_ledger_exported": "Gönderim listesi dışa aktarıldı"`
    - `"action_performance_summary_exported": "Performans özeti dışa aktarıldı"`

    Preserve JSON validity: every new entry needs a trailing comma EXCEPT the last one in its containing object. The 21-key `dashboard.admin.exports.*` namespace + 2 `hakedis.detail.*` keys are NOT this plan's job — they ship in Plan 11-01b.
  </action>
  <verify>
    <automated>node_modules/.bin/tsc --noEmit 2>&amp;1 | grep -E "office-activity-log|OfficeActionType|office-engineers" || echo "OK no errors"; grep -c "hakedis_pdf_exported\|hakedis_excel_exported\|submission_ledger_exported\|performance_summary_exported" src/db/schema/office-activity-log.ts | grep -q "^4$" &amp;&amp; echo "4 new types in schema"; grep -c "hakedis_pdf_exported\|hakedis_excel_exported\|submission_ledger_exported\|performance_summary_exported" "src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx" | grep -q "^4$" &amp;&amp; echo "4 new map entries in OE scorecard"; node -e "const en=require('./messages/en.json'); const tr=require('./messages/tr.json'); const k=['action_hakedis_pdf_exported','action_hakedis_excel_exported','action_submission_ledger_exported','action_performance_summary_exported']; for(const x of k){if(!en.dashboard.admin.oe_scorecard[x] || !tr.dashboard.admin.oe_scorecard[x]) throw new Error('missing '+x);} console.log('all 4 i18n keys present');"</automated>
  </verify>
  <acceptance_criteria>
    - `src/db/schema/office-activity-log.ts` contains exactly these 4 new strings inside the `OFFICE_ACTION_TYPES` `as const` array: `hakedis_pdf_exported`, `hakedis_excel_exported`, `submission_ledger_exported`, `performance_summary_exported`.
    - No new files under `src/db/migrations/`.
    - `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx` `actionTypeToKey` map contains the 4 new entries; existing `action_unknown` fallback unchanged.
    - `messages/en.json` and `messages/tr.json` each gain the 4 `action_*_exported` keys under `dashboard.admin.oe_scorecard`; both JSON files parse cleanly.
    - The verify automation prints `"all 4 i18n keys present"`.
    - `npx tsc --noEmit` shows no errors.
    - `git diff` shows only additions (no line deletions or reorderings of existing entries) across the four files.
  </acceptance_criteria>
  <done>4 new action types in schema; 4 map entries in OE scorecard; 4 i18n action keys in EN + TR; tsc clean; no migration file.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| package registry → developer machine | npm install runs maintainer-controlled scripts — supply chain |
| TTF asset at rest → PDF route handler | font path is a hardcoded constant — no user input |
| TypeScript schema → drizzle SQL | new action_type strings flow into office_activity_log writes |
| activity_log.action_type → actionTypeToKey() → t() | unknown action_type falls back to 'action_unknown' |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-01a-SC | Tampering | npm install (@react-pdf/renderer + dejavu-fonts-ttf + pdf-parse) | mitigate | Blocking-human checkpoint (Task 0) verifies each package on npmjs.com per slopcheck `[ASSUMED]` fallback policy. T-{phase}-SC pattern from the planner's package-legitimacy gate. |
| T-11-01a-FONT | Information Disclosure | public/fonts/DejaVuSans.ttf path | accept | Path is a hardcoded constant (`path.join(process.cwd(), 'public/fonts/DejaVuSans.ttf')` in Plan 04). No user input contributes to the path — no traversal vector. |
| T-11-01a-TYPE | Tampering | OFFICE_ACTION_TYPES extension | mitigate | New strings added to a static `as const` tuple at build time. Runtime callers cannot inject new action_types (TypeScript narrows the parameter to the union). Database column is plain text; even if a bug allowed unknown values, the worst case is an unrecognised string in the activity log — no privilege escalation; OE scorecard falls back to `action_unknown`. |
| T-11-01a-i18n | Spoofing | TR/EN message merge | accept | JSON files validated by `JSON.parse` and `next-intl` key-coverage at compile-time. No user-controlled content. |
</threat_model>

<verification>
## Plan-level Checks

After all 3 tasks (0 = checkpoint, 1-2 = auto):
- `node_modules/.bin/tsc --noEmit` clean.
- `ls public/fonts/DejaVuSans.ttf public/fonts/DejaVuSans-Bold.ttf` — both present, each >100 KB.
- Package-lock includes the three new dependencies at the pinned versions.
- `grep -c "submission_ledger_exported" src/db/schema/office-activity-log.ts` returns 1.
- `grep -c "submission_ledger_exported" "src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx"` returns 1.
- Both `messages/en.json` and `messages/tr.json` parse via `node -e "JSON.parse(require('fs').readFileSync(...))"`.
</verification>

<success_criteria>
- Plan 11-01b can immediately begin in the same wave with all packages installed and the schema/OE scorecard/i18n action keys in place.
- No DB migration created (per `<no_schema_migration>` planning context — strictly enforced).
- The checkpoint:human-verify package legitimacy gate ran BEFORE npm install, per T-11-01a-SC.
- Hoisting the OE scorecard `actionTypeToKey()` map and 4 i18n action keys here (originally in old Plan 11-06) means: any office_activity_log row written by Wave 2 plans renders the correct label immediately, with no transient "action_unknown" period during the rollout.
</success_criteria>

<output>
Create `.planning/phases/11-exports/11-01a-SUMMARY.md` when done. Include: dependency versions actually installed, sizes of the two TTF files, list of 4 new OFFICE_ACTION_TYPES, the 4 new actionTypeToKey map entries, and the 4 new i18n keys added to en.json + tr.json.
</output>
