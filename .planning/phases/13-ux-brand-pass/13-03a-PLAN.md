---
phase: 13-ux-brand-pass
plan: 03a
type: execute
wave: 3
depends_on: [13-01]
files_modified:
  - src/app/dashboard/(admin)/overview/page.tsx
  - src/app/dashboard/(admin)/overview/EVTableClient.tsx
  - src/app/dashboard/(admin)/analytics/page.tsx
  - src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx
  - src/components/admin/KpiCard.tsx
  - src/components/admin/FilterBar.tsx
  - src/components/admin/CurrencySelector.tsx
autonomous: true
requirements:
  - BRAND-02
user_setup: []

must_haves:
  truths:
    - "Overview page renders portfolio KPIs via re-skinned KpiCard with BrandCard shell, no shadows, rounded-md, compact density"
    - "KpiCard composes BrandCard internally; D-87 valueColor (default/warning/destructive) and alertBadge corner slot preserved byte-identical"
    - "Worker / auditor SLA / rejection / stalled alert badges on the overview render via BrandBadge variants (warning / destructive) — no raw shadcn Badge inline classes"
    - "FilterBar primary/reset CTAs use BrandButton variants; date-range / project / person / status query-param wiring untouched"
    - "EVTableClient earned-value table uses BrandTable + BrandCard; EV/BAC computation calls byte-identical"
    - "Analytics hub (`/dashboard/analytics`) section wrappers use BrandCard; headings use BrandHeading"
    - "Office-Engineer scorecard (`/dashboard/analytics/office-engineers/[userId]`) activity-log table uses BrandTable; OFFICE_ACTION_TYPES rendering + actionTypeToKey() i18n map (Phase 11) frozen"
    - "ZERO raw `from '@/components/ui/button'` imports remain in any converted file (full-conversion gate)"
    - "Phase 8/9 portfolio + analytics tests still green; auth + tenant scope on every page preserved"
  artifacts:
    - path: "src/app/dashboard/(admin)/overview/page.tsx"
      provides: "Re-skinned command center; KpiCard + BrandCard shells; Stalled Projects card; SLA alert badges via BrandBadge"
      contains: "BrandCard"
    - path: "src/components/admin/KpiCard.tsx"
      provides: "Re-skinned KPI tile; D-87 valueColor (default/warning/destructive) preserved; alertBadge slot preserved"
      contains: "BrandCard"
    - path: "src/app/dashboard/(admin)/analytics/page.tsx"
      provides: "Re-skinned analytics hub"
      contains: "BrandCard"
    - path: "src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx"
      provides: "Re-skinned OE scorecard with BrandTable activity log"
      contains: "BrandTable"
  key_links:
    - from: "src/app/dashboard/(admin)/overview/page.tsx"
      to: "src/components/admin/KpiCard.tsx"
      via: "import + JSX render of portfolio KPI tiles"
      pattern: "KpiCard"
    - from: "src/components/admin/KpiCard.tsx"
      to: "src/components/brand/BrandCard.tsx"
      via: "import + JSX render — KpiCard composes BrandCard internally"
      pattern: "BrandCard"
    - from: "src/components/admin/FilterBar.tsx"
      to: "src/components/brand"
      via: "BrandButton wiring"
      pattern: "BrandButton"
---

<objective>
Wave 3 (command-center stack) — Overview + Analytics + Office-Engineer Scorecard + KpiCard refactor + FilterBar + CurrencySelector + EVTableClient. This plan handles the "command center" surface set: the cross-project overview that the office engineer hits first every day, plus the analytics hub and the OE scorecard that drill off it. Refactor `KpiCard.tsx` to compose `BrandCard` internally so every KPI tile rendered in the overview + scorecards + people profile (Plan 13-03b) inherits the brand language without per-tile edits.

Purpose: The command center is the highest-velocity surface in the admin app — getting BrandCard composition right in KpiCard cascades to every Wave 3 + Wave 4 surface that mounts a KPI tile. Splitting this stack from the directory + settings stack (Plan 13-03b) keeps each plan under the 15-file blocker threshold while preserving parallel execution against Wave 1.

Output: Overview + analytics + OE scorecard + KpiCard + FilterBar + CurrencySelector + EVTableClient render with slate canvas + amber accent + compact density + flat depth; chart colors automatically inherit the Wave 1 chart-1..chart-5 cascade; D-87 KpiCard contract preserved; all Phase 8/9 portfolio tests pass.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/13-ux-brand-pass/13-CONTEXT.md
@.planning/phases/13-ux-brand-pass/13-RESEARCH.md
@.planning/phases/13-ux-brand-pass/13-VALIDATION.md

<interfaces>
<!-- Brand primitives shipped in Wave 1 -->
From src/components/brand/index.ts:
  export { BrandButton, BrandCard, BrandBadge, BrandTable, BrandHeading, BrandEmpty, BrandLogo }

<!-- KpiCard Phase 9 D-87 contract -->
From src/components/admin/KpiCard.tsx (current):
  Phase 9 extended KpiCard with:
    - valueColor: 'default' | 'warning' | 'destructive' (D-87 — amber for warning, red for destructive)
    - alertBadge: ReactNode prop (corner slot for SLA breach / stalled badge)
  These props MUST be preserved byte-identical — overview/page.tsx consumes them at the SLA alert paths; person profile (Plan 13-03b) consumes them too.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Refactor KpiCard + re-skin FilterBar + CurrencySelector (shared scaffolding for overview + person profile)</name>
  <read_first>
    - src/components/admin/KpiCard.tsx (Phase 9 valueColor + alertBadge contract — DO NOT change props signature)
    - src/components/admin/FilterBar.tsx (6.7K — date-range + project + person + status filters)
    - src/components/admin/CurrencySelector.tsx (1.6K — page-local currency picker)
    - .planning/phases/13-ux-brand-pass/13-CONTEXT.md §D-125 (compact density) + §D-128 (Procore/Autodesk dense table analog — amber NOT blue; the deliberate market departure)
    - .planning/phases/13-ux-brand-pass/13-RESEARCH.md §Item 4 (KpiCard refactor preferred over a BrandKpiTile primitive)
  </read_first>
  <files>src/components/admin/KpiCard.tsx, src/components/admin/FilterBar.tsx, src/components/admin/CurrencySelector.tsx</files>
  <action>
    Step 1 — `src/components/admin/KpiCard.tsx`:
      - Add `import { BrandCard } from '@/components/brand';` at top.
      - Refactor the inner root element to compose `<BrandCard><BrandCard.Body className="p-3">...</BrandCard.Body></BrandCard>` (D-125 KPI tile = p-3).
      - Preserve Phase 9 D-87 contract: `valueColor` prop ('default' | 'warning' | 'destructive') still drives the value-text color via tokens (`text-foreground` / `text-warning` / `text-destructive` — Wave 1 added `--color-warning` token).
      - Preserve the `alertBadge` corner slot (renders the passed ReactNode in the top-right corner — Phase 9 D-87 contract).
      - Remove any `shadow-*` / `rounded-lg` / `rounded-xl` / `p-6` from the file (D-125 enforcement).
      - DO NOT change the component's exported prop signature (label / value / icon / valueColor / alertBadge / className) — overview/page.tsx and people/[personId]/page.tsx call KpiCard with specific props at multiple call sites.
      - REMOVE any `import { Card... } from '@/components/ui/card'` line if present (raw-import == 0 gate; KpiCard now goes through BrandCard).

    Step 2 — `src/components/admin/CurrencySelector.tsx`:
      - Visual restyle only — the page-local currency picker (D-67) likely uses shadcn `Select`. Verify no inline `shadow-*` / `rounded-lg` classes remain. The Select primitive itself inherits from the token cascade.
      - If a raw shadcn `Button` import is present and unused-or-replaceable, remove it.

    Step 3 — `src/components/admin/FilterBar.tsx`:
      - Add `import { BrandButton } from '@/components/brand';` at top.
      - Replace any primary action `<Button>` (Apply / Reset filters) with `<BrandButton variant="primary" size="sm">` / `<BrandButton variant="ghost" size="sm">`.
      - Replace any `shadow-*` / `rounded-lg` utility classes with `rounded-md` / no-shadow per D-125.
      - Keep all date-range / project / person / status select wiring + URL query param syncing byte-identical.
      - REMOVE the `import { Button } from '@/components/ui/button'` line entirely after conversion (raw-import == 0 gate).
  </action>
  <verify>
    <automated>
      grep -c "BrandCard" src/components/admin/KpiCard.tsx; (>= 1 — KpiCard composes BrandCard)
      grep -c "valueColor" src/components/admin/KpiCard.tsx; (>= 1 — D-87 prop preserved)
      grep -c "alertBadge" src/components/admin/KpiCard.tsx; (>= 1 — D-87 alert badge slot preserved)
      grep -c "BrandButton" src/components/admin/FilterBar.tsx; (>= 1)
      grep -c "from '@/components/ui/button'" src/components/admin/FilterBar.tsx; (== 0 — full conversion gate)
      grep -v "^#" src/components/admin/KpiCard.tsx | grep -Ec "shadow-(sm|md|lg|xl|2xl)\\b"; (== 0 — D-125)
      grep -v "^#" src/components/admin/FilterBar.tsx | grep -Ec "shadow-(sm|md|lg|xl|2xl)\\b"; (== 0)
      npx vitest run; (full suite green; Phase 8/9 KpiCard tests intact if any)
      npx next build 2>&1 | tail -5; (exit 0)
    </automated>
  </verify>
  <done>KpiCard composes BrandCard with D-87 contract preserved; FilterBar + CurrencySelector re-skinned; ZERO raw `from '@/components/ui/button'` imports remain in FilterBar; full vitest green; next build exits 0.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Re-skin overview + EVTableClient + analytics hub + OE scorecard</name>
  <read_first>
    - src/app/dashboard/(admin)/overview/page.tsx (10.7K + EVTableClient.tsx 7.2K)
    - src/app/dashboard/(admin)/analytics/page.tsx (4.0K — analytics hub)
    - src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx (9.0K — OE scorecard)
    - .planning/phases/13-ux-brand-pass/13-CONTEXT.md §D-125 (compact density) + §D-128 (Procore/Autodesk dense data table analog — amber NOT blue; deliberate departure from construction-software-blue norm)
    - src/components/admin/KpiCard.tsx (D-87 valueColor + alertBadge — already refactored in Task 1)
  </read_first>
  <files>src/app/dashboard/(admin)/overview/page.tsx, src/app/dashboard/(admin)/overview/EVTableClient.tsx, src/app/dashboard/(admin)/analytics/page.tsx, src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx</files>
  <action>
    Step 1 — `src/app/dashboard/(admin)/overview/page.tsx`:
      - Add `import { BrandCard, BrandHeading, BrandBadge } from '@/components/brand';` at top.
      - Wrap page-level sections in `<BrandCard>` shells where bespoke divs currently exist (the trend chart sections, the EV table section, the alert sections — observe the existing structure and convert each `<Card>` to `<BrandCard>` analog).
      - Replace any `<h1>` / `<h2>` with `<BrandHeading as="h1" size="h1">` / `<BrandHeading as="h2" size="h2">`.
      - The KpiCard mount points stay byte-identical — KpiCard now composes BrandCard internally per Task 1.
      - The Phase 9 D-87 alert color logic (pendingColor / rejectionAlertFires / stalledColor — see file header comment lines 19–28) MUST stay byte-identical.
      - Replace inline `<Badge variant="...">` calls for SLA alerts with `<BrandBadge variant="warning">` (SLA breach) or `<BrandBadge variant="destructive">` (stalled / rejection spike) per D-121 semantic mapping.
      - Sweep file for `shadow-*` / `rounded-lg` / `p-6` and convert per D-125.
      - DO NOT change any analytics-action import (getPortfolioKPIs / getPortfolioTrends / getStalledProjects / getActivePeople / getTenantSettings) or any data-fetch path.
      - REMOVE any `import { Button } from '@/components/ui/button'` / `import { Badge } from '@/components/ui/badge'` lines after conversion (raw-import == 0 gate).

    Step 2 — `src/app/dashboard/(admin)/overview/EVTableClient.tsx` (7.2K):
      - Add `import { BrandTable, BrandCard } from '@/components/brand';` at top.
      - Replace `<Table>` etc. with `<BrandTable.Root>` namespaced equivalents.
      - Convert any `<Card>` wrapping to `<BrandCard>`. Remove shadow/large-radius/p-6 per D-125.
      - Keep all client-side filtering + sort wiring + EV/BAC computation calls byte-identical.
      - REMOVE any `import { Button } from '@/components/ui/button'` line after conversion (raw-import == 0 gate).

    Step 3 — `src/app/dashboard/(admin)/analytics/page.tsx` (4.0K — analytics hub):
      - Add `import { BrandCard, BrandHeading, BrandButton } from '@/components/brand';` at top.
      - Replace section wrappers with `<BrandCard>`; headings with `<BrandHeading>`; primary action buttons with `<BrandButton>`.
      - Sweep file for D-125 violations.
      - REMOVE any `import { Button } from '@/components/ui/button'` line after conversion (raw-import == 0 gate).

    Step 4 — `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx` (9.0K — OE scorecard):
      - Add `import { BrandCard, BrandTable, BrandButton, BrandHeading } from '@/components/brand';` at top.
      - Activity-log table → `<BrandTable.*>`.
      - Section cards → `<BrandCard>`.
      - Action-row buttons → `<BrandButton variant="outline">`.
      - Sweep file for D-125 violations.
      - DO NOT change OFFICE_ACTION_TYPES rendering or actionTypeToKey() i18n map (Phase 11 hoisted these — frozen).
      - REMOVE any `import { Button } from '@/components/ui/button'` line after conversion (raw-import == 0 gate).
  </action>
  <verify>
    <automated>
      grep -c "BrandCard" "src/app/dashboard/(admin)/overview/page.tsx"; (>= 1)
      grep -c "BrandHeading" "src/app/dashboard/(admin)/overview/page.tsx"; (>= 1)
      grep -c "BrandBadge" "src/app/dashboard/(admin)/overview/page.tsx"; (>= 1 — SLA badges)
      grep -c "from '@/components/ui/button'" "src/app/dashboard/(admin)/overview/page.tsx"; (== 0 — full conversion gate)
      grep -c "from '@/components/ui/badge'" "src/app/dashboard/(admin)/overview/page.tsx"; (== 0 — full conversion gate)
      grep -c "BrandTable" "src/app/dashboard/(admin)/overview/EVTableClient.tsx"; (>= 1)
      grep -c "from '@/components/ui/button'" "src/app/dashboard/(admin)/overview/EVTableClient.tsx"; (== 0 — full conversion gate)
      grep -c "BrandCard" "src/app/dashboard/(admin)/analytics/page.tsx"; (>= 1)
      grep -c "from '@/components/ui/button'" "src/app/dashboard/(admin)/analytics/page.tsx"; (== 0 — full conversion gate)
      grep -c "BrandTable" "src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx"; (>= 1)
      grep -c "from '@/components/ui/button'" "src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx"; (== 0 — full conversion gate)
      grep -v "^#" "src/app/dashboard/(admin)/overview/page.tsx" | grep -Ec "shadow-(sm|md|lg|xl|2xl)\\b"; (== 0)
      npx vitest run; (full suite green; Phase 8/9 analytics tests intact)
      npx next build 2>&1 | tail -5; (exit 0)
    </automated>
  </verify>
  <done>Overview + EVTableClient + analytics hub + OE scorecard re-skinned via brand primitives; D-87 alert color logic on overview preserved; ZERO raw `from '@/components/ui/button'` or `/ui/badge` imports remain in any converted file; full vitest green; next build exits 0.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user → overview / analytics / OE scorecard | Existing — auth + tenant scope unchanged; Phase 13 does not touch data-fetch paths |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-13-03a-REG | Tampering (regression) | Phase 9 KpiCard D-87 contract (valueColor + alertBadge slots) | mitigate | Task 1 grep gate asserts both props still referenced in KpiCard.tsx post-refactor |
| T-13-03a-REG2 | Tampering (regression) | Phase 9 alert color logic in overview/page.tsx (pendingColor / rejectionAlertFires / stalledColor) | mitigate | Action explicitly preserves the file header comment + the alert color computation; review during execution against the original line numbers (19–28 of the current file) |
| T-13-03a-OE | Tampering (regression) | Phase 11 OFFICE_ACTION_TYPES + actionTypeToKey() i18n map on OE scorecard | mitigate | Task 2 Step 4 explicitly forbids touching OE action-type rendering |
| T-13-03a-AUTH | Authorization | Analytics + overview server actions | accept | Out of scope — restyling does not touch the server action wiring |
</threat_model>

<verification>
- VALIDATION.md Manual UAT row "Wave 3 command-center re-skin holds the language" SATISFIED on Wave 3 merge (final UAT at Wave 4 covers visual sign-off).
- Phase 9 D-87 KpiCard contract preserved via grep gates in Task 1.
- Per-file raw shadcn Button + Badge import gates (== 0) prevent partial conversions.
- Phase 11 OE scorecard i18n map preserved (Task 2 Step 4).
</verification>

<success_criteria>
- BRAND-02: Overview + analytics + OE scorecard + KpiCard + FilterBar + CurrencySelector + EVTableClient all render via brand primitives; no shadow/lg-radius/p-6 utility classes remain; no raw `from '@/components/ui/button'` or `/ui/badge` imports remain in any converted file.
- Phase 9 contracts intact: KpiCard.valueColor / alertBadge props preserved; alert color logic in overview/page.tsx preserved.
- Full vitest suite green; next build exits 0.
</success_criteria>

<output>
Create `.planning/phases/13-ux-brand-pass/13-03a-SUMMARY.md` when done. Record: count of files re-skinned (target 7), KpiCard valueColor + alertBadge grep-gate result, raw-shadcn-Button-import counts (all 0), and any Phase 9 alert-color logic risk note observed during execution.
</output>
