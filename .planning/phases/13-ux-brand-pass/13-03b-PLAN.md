---
phase: 13-ux-brand-pass
plan: 03b
type: execute
wave: 3
depends_on: [13-01]
files_modified:
  - src/app/dashboard/(admin)/people/page.tsx
  - src/app/dashboard/(admin)/people/[personId]/page.tsx
  - src/app/dashboard/(admin)/settings/page.tsx
  - src/app/dashboard/records/page.tsx
  - src/app/dashboard/records/[id]/page.tsx
  - src/components/admin/SubmissionDetailView.tsx
  - src/components/admin/ActivityTimeline.tsx
  - src/components/admin/LeaderboardSortSelect.tsx
  - src/components/admin/ThresholdSettingsForm.tsx
  - src/components/admin/TrendChartsClient.tsx
autonomous: true
requirements:
  - BRAND-02
user_setup: []

must_haves:
  truths:
    - "People directory + per-person profile + activity timeline use BrandCard sections, BrandHeading hierarchy, BrandTable rows"
    - "Worker / auditor profile pages render scorecards with brand primitives; person-status badges (active/inactive) use BrandBadge variants"
    - "Cross-project records list page uses BrandTable + FilterBar"
    - "Submission detail page (records/[id] + SubmissionDetailView) uses BrandCard sections for photo + metadata + audit decision trail; `<a target=\"_blank\" rel=\"noopener noreferrer\">` photo-viewer link preserved (reverse-tabnabbing mitigation)"
    - "Submission status badge uses BrandBadge variants (approved=success, pending=info, rejected=destructive)"
    - "Settings page (tenant thresholds form) uses BrandCard + BrandButton; D-83/D-84 default value logic + zod schema + server-action wiring untouched"
    - "TrendChartsClient inherits token cascade for chart colors (chart-1..chart-5 already amber/sky/emerald/amber-700/slate from Wave 1) — no hardcoded hex chart colors remain"
    - "Activity timeline rows preserve Phase 11 next-intl action-key lookup (action_*_exported keys in TR/EN)"
    - "LeaderboardSortSelect uses BrandButton for any action-row CTA"
    - "ZERO raw `from '@/components/ui/button'` imports remain in any converted file (full-conversion gate)"
    - "All Phase 8/9 records + people tests still green; auth + tenant scope on every page preserved"
  artifacts:
    - path: "src/app/dashboard/(admin)/people/page.tsx"
      provides: "Re-skinned people directory (Workers / Auditors tabs)"
      contains: "BrandCard"
    - path: "src/app/dashboard/(admin)/people/[personId]/page.tsx"
      provides: "Re-skinned per-person profile with scorecard + activity timeline"
      contains: "BrandCard"
    - path: "src/app/dashboard/records/[id]/page.tsx"
      provides: "Re-skinned canonical submission detail surface"
      contains: "BrandCard"
    - path: "src/app/dashboard/(admin)/settings/page.tsx"
      provides: "Re-skinned tenant-settings host page"
      contains: "BrandCard"
    - path: "src/components/admin/SubmissionDetailView.tsx"
      provides: "Re-skinned submission detail; photo target=_blank rel=noopener noreferrer preserved"
      contains: "BrandCard"
    - path: "src/components/admin/ThresholdSettingsForm.tsx"
      provides: "Re-skinned tenant SLA threshold editor; zod schema + server action untouched"
      contains: "BrandCard"
    - path: "src/components/admin/TrendChartsClient.tsx"
      provides: "Trend charts inherit token-bound chart-1..chart-5 colors; no hardcoded hex"
      contains: "BrandCard"
  key_links:
    - from: "src/app/dashboard/(admin)/people/[personId]/page.tsx"
      to: "src/components/admin/ActivityTimeline.tsx"
      via: "import + JSX render of person activity"
      pattern: "ActivityTimeline"
    - from: "src/components/admin/ThresholdSettingsForm.tsx"
      to: "src/components/brand"
      via: "BrandCard + BrandButton wiring"
      pattern: "BrandCard"
    - from: "src/components/admin/TrendChartsClient.tsx"
      to: "globals.css :root chart-1..chart-5"
      via: "CSS variable references (no hardcoded hex)"
      pattern: "var\\(--chart-"
---

<objective>
Wave 3 (directory + settings stack) — People directory + per-person profile + ActivityTimeline + cross-project records list + canonical submission detail (records/[id] + SubmissionDetailView) + tenant Settings + ThresholdSettingsForm + TrendChartsClient + LeaderboardSortSelect. This plan handles the "directory + records + settings" surface set: where the office engineer drills into individual workers/auditors, opens a single submission for review, and tunes tenant SLA thresholds.

Purpose: These surfaces are the second half of the Wave 3 admin surface set. Splitting from 13-03a (command center) keeps each plan under the 15-file blocker threshold while preserving parallel execution against Wave 1.

Output: People directory + profile + ActivityTimeline + records list + records detail + SubmissionDetailView + settings + ThresholdSettingsForm + TrendChartsClient + LeaderboardSortSelect render with slate canvas + amber accent + compact density + flat depth; chart colors token-bound; Phase 8/9 records + people tests pass; reverse-tabnabbing mitigation on the photo link preserved.
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

<!-- KpiCard composes BrandCard internally (shipped by Plan 13-03a Task 1) -->
KpiCard mounts inside scorecard sections inherit BrandCard composition automatically — no per-tile edits needed in this plan.

<!-- TrendChartsClient (recharts-based) -->
recharts auto-reads from CSS variables when its <Cell fill="hsl(var(--chart-1))" /> pattern is used. Wave 1 already set chart-1..chart-5 to amber/sky/emerald/amber-700/slate-400 oklch. Plan 13-03b should NOT introduce hardcoded hex chart colors — let the cascade flow.

<!-- Submission detail view contract -->
SubmissionDetailView at src/components/admin/SubmissionDetailView.tsx renders:
  - Photo card with target="_blank" rel="noopener noreferrer" anchor (reverse-tabnabbing mitigation — frozen)
  - Metadata card (worker, project, BOQ item, qty, status, timestamps)
  - Audit decision trail (auditor + decision + rejection reason if present)
  - Status badge: approved=success, pending=info, rejected=destructive (BrandBadge variants per D-121)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Re-skin people directory + per-person profile + ActivityTimeline + LeaderboardSortSelect + records list + records detail + SubmissionDetailView</name>
  <read_first>
    - src/app/dashboard/(admin)/people/page.tsx (17.9K — people directory; Workers / Auditors tabs)
    - src/app/dashboard/(admin)/people/[personId]/page.tsx (16.5K — per-person profile with scorecard + timeline)
    - src/components/admin/ActivityTimeline.tsx (5.4K)
    - src/components/admin/LeaderboardSortSelect.tsx (1.9K)
    - src/app/dashboard/records/page.tsx (10.5K — cross-project records list)
    - src/app/dashboard/records/[id]/page.tsx (consumes SubmissionDetailView)
    - src/components/admin/SubmissionDetailView.tsx (10.2K — canonical submission detail)
    - .planning/phases/13-ux-brand-pass/13-CONTEXT.md §D-125 + §D-128 (Procore/Autodesk dense data table analog — amber NOT blue)
  </read_first>
  <files>src/app/dashboard/(admin)/people/page.tsx, src/app/dashboard/(admin)/people/[personId]/page.tsx, src/components/admin/ActivityTimeline.tsx, src/components/admin/LeaderboardSortSelect.tsx, src/app/dashboard/records/page.tsx, src/app/dashboard/records/[id]/page.tsx, src/components/admin/SubmissionDetailView.tsx</files>
  <action>
    Step 1 — `src/app/dashboard/(admin)/people/page.tsx`:
      - Add `import { BrandCard, BrandTable, BrandHeading, BrandBadge, BrandButton } from '@/components/brand';`.
      - Workers / Auditors tabs: keep shadcn `Tabs` primitive (it pulls from the token cascade); wrap each tab content in `<BrandCard>`.
      - Replace person-row tables with `<BrandTable.*>`.
      - Person-status badges (active / inactive) → `<BrandBadge variant=...>` (active=success, inactive=neutral).
      - Page heading → `<BrandHeading as="h1" size="h1">`.
      - Sweep file for D-125 violations.
      - DO NOT touch getActivePeople / getPortfolioPeople data-fetch wiring.
      - REMOVE any `import { Button } from '@/components/ui/button'` or `import { Badge } from '@/components/ui/badge'` lines after conversion (raw-import == 0 gate).

    Step 2 — `src/app/dashboard/(admin)/people/[personId]/page.tsx`:
      - Add `import { BrandCard, BrandHeading, BrandButton } from '@/components/brand';`.
      - Worker scorecard section + Auditor scorecard section (depending on person role) → `<BrandCard>` shells. The KpiCard tiles inside the scorecard inherit BrandCard composition from Plan 13-03a Task 1.
      - Per-person profile header → `<BrandHeading>` hierarchy.
      - Activity timeline section → `<BrandCard>` shell hosting `<ActivityTimeline />` (Step 3).
      - Value contribution + throughput / approval-rate / location-compliance KPI rows → KpiCard mounts unchanged.
      - Drill-through link to submission detail → `<BrandButton variant="ghost" asChild><Link href={...}>...</Link></BrandButton>` or stays as a plain styled `<Link>` — implementer's call.
      - Sweep for D-125 violations.
      - REMOVE any `import { Button } from '@/components/ui/button'` line after conversion (raw-import == 0 gate).

    Step 3 — `src/components/admin/ActivityTimeline.tsx`:
      - Timeline row composition uses bespoke divs (no shadcn primitive). Convert outer wrapper to `<BrandCard.Body>` if appropriate; ensure no shadow/lg-radius/p-6 utilities.
      - Activity-type icons stay `size-4` per D-126 inline icon convention.
      - Each row's action label uses next-intl key (Phase 11 ensured 4 action types resolve to action_*_exported keys in TR/EN) — DO NOT change i18n lookup.

    Step 4 — `src/components/admin/LeaderboardSortSelect.tsx` (1.9K):
      - shadcn Select-based dropdown. Wrap trigger / replace `<Button>` apply with `<BrandButton variant="outline" size="sm">` if present.
      - Sweep for D-125 violations.
      - REMOVE any `import { Button } from '@/components/ui/button'` line after conversion (raw-import == 0 gate).

    Step 5 — `src/app/dashboard/records/page.tsx` + `src/app/dashboard/records/[id]/page.tsx`:
      - records/page.tsx: cross-project records list → BrandTable + FilterBar (already re-skinned in Plan 13-03a) + BrandCard shells.
      - records/[id]/page.tsx: imports SubmissionDetailView (Step 6 below). Wrap page-level layout in BrandCard if not already.
      - Sweep for D-125 violations.
      - REMOVE any `import { Button } from '@/components/ui/button'` line after conversion (raw-import == 0 gate).

    Step 6 — `src/components/admin/SubmissionDetailView.tsx` (10.2K):
      - Add `import { BrandCard, BrandButton, BrandBadge, BrandHeading } from '@/components/brand';` at top.
      - Replace each `<Card>` section (photo card, metadata card, decision-trail card) with `<BrandCard>` shells.
      - Replace any primary action `<Button>` (Approve/Reject affordances if present) with `<BrandButton variant="primary">` / `<BrandButton variant="destructive">`.
      - The `<a target="_blank" rel="noopener noreferrer">` on photo viewer link MUST stay byte-identical (reverse-tabnabbing mitigation — preserved from Phase 8 contract).
      - Status badge → `<BrandBadge variant=...>` (approved=success, pending=info, rejected=destructive).
      - Sweep for D-125 violations.
      - REMOVE any `import { Button } from '@/components/ui/button'` / `import { Badge } from '@/components/ui/badge'` lines after conversion (raw-import == 0 gate).
  </action>
  <verify>
    <automated>
      grep -c "BrandCard" "src/app/dashboard/(admin)/people/page.tsx"; (>= 1)
      grep -c "BrandTable" "src/app/dashboard/(admin)/people/page.tsx"; (>= 1)
      grep -c "from '@/components/ui/button'" "src/app/dashboard/(admin)/people/page.tsx"; (== 0 — full conversion gate)
      grep -c "BrandCard" "src/app/dashboard/(admin)/people/[personId]/page.tsx"; (>= 1)
      grep -c "from '@/components/ui/button'" "src/app/dashboard/(admin)/people/[personId]/page.tsx"; (== 0 — full conversion gate)
      grep -c "BrandTable" src/app/dashboard/records/page.tsx; (>= 1)
      grep -c "from '@/components/ui/button'" src/app/dashboard/records/page.tsx; (== 0 — full conversion gate)
      grep -c "BrandCard" src/components/admin/SubmissionDetailView.tsx; (>= 2 — photo + metadata sections)
      grep -c "BrandBadge" src/components/admin/SubmissionDetailView.tsx; (>= 1 — status badge)
      grep -c 'target="_blank"' src/components/admin/SubmissionDetailView.tsx; (>= 1 — reverse-tabnabbing preserved)
      grep -c 'rel="noopener noreferrer"' src/components/admin/SubmissionDetailView.tsx; (>= 1 — reverse-tabnabbing preserved)
      grep -c "from '@/components/ui/button'" src/components/admin/SubmissionDetailView.tsx; (== 0 — full conversion gate)
      grep -v "^#" "src/app/dashboard/(admin)/people/page.tsx" | grep -Ec "shadow-(sm|md|lg|xl|2xl)\\b"; (== 0)
      grep -v "^#" "src/app/dashboard/(admin)/people/[personId]/page.tsx" | grep -Ec "shadow-(sm|md|lg|xl|2xl)\\b"; (== 0)
      npx vitest run; (full suite green; Phase 8/9 records + people tests intact)
      npx next build 2>&1 | tail -5; (exit 0)
    </automated>
  </verify>
  <done>People directory + profile + ActivityTimeline + LeaderboardSortSelect + records list/detail + SubmissionDetailView re-skinned; reverse-tabnabbing mitigation preserved; ZERO raw `from '@/components/ui/button'` or `/ui/badge` imports remain in any converted file; full vitest green.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Re-skin ThresholdSettingsForm + TrendChartsClient + settings page</name>
  <read_first>
    - src/components/admin/ThresholdSettingsForm.tsx (7.8K — tenant SLA thresholds editor)
    - src/components/admin/TrendChartsClient.tsx (9.6K — recharts-based trend chart container)
    - src/app/dashboard/(admin)/settings/page.tsx (2.3K — host page for ThresholdSettingsForm)
    - .planning/phases/13-ux-brand-pass/13-CONTEXT.md §D-125 + §D-126 (icon sizes)
  </read_first>
  <files>src/components/admin/ThresholdSettingsForm.tsx, src/components/admin/TrendChartsClient.tsx, src/app/dashboard/(admin)/settings/page.tsx</files>
  <action>
    Step 1 — `src/components/admin/ThresholdSettingsForm.tsx` (7.8K — tenant threshold editor at /dashboard/settings):
      - Add `import { BrandCard, BrandButton } from '@/components/brand';` at top.
      - Section wrapper → `<BrandCard>`.
      - Submit button → `<BrandButton variant="primary">`.
      - Cancel / reset button → `<BrandButton variant="outline">`.
      - Number inputs / sliders stay shadcn (inherit token cascade).
      - DO NOT touch the zod schema, server action call, or D-83/D-84 default value logic.
      - Sweep for D-125 violations.
      - REMOVE the `import { Button } from '@/components/ui/button'` line entirely after conversion (raw-import == 0 gate).

    Step 2 — `src/components/admin/TrendChartsClient.tsx` (9.6K):
      - Add `import { BrandCard } from '@/components/brand';` at top.
      - recharts container. Wrap chart section in `<BrandCard>` if not already.
      - Chart `<Cell>` fills, `<Line stroke>`, `<Bar fill>` etc. should use `hsl(var(--chart-1))` / `oklch(var(--chart-2))` token references — NOT hardcoded hex. Wave 1 cascade made chart-1..chart-5 amber/sky/emerald/amber-700/slate. If the file uses hardcoded hex values (`#2563EB` blue), replace with `var(--chart-N)` token references.
      - Sweep for D-125 violations.
      - Tooltip + legend styling: recharts inherits via CSS vars; verify dark text reads on slate-50.

    Step 3 — `src/app/dashboard/(admin)/settings/page.tsx` (2.3K — hosts ThresholdSettingsForm):
      - Add `import { BrandCard, BrandHeading } from '@/components/brand';` at top.
      - Page-level wrapper → `<BrandCard>` shell + `<BrandHeading as="h1" size="h1">` page title.
      - Sweep for D-125 violations.
      - REMOVE any `import { Button } from '@/components/ui/button'` line after conversion (raw-import == 0 gate).
  </action>
  <verify>
    <automated>
      grep -c "BrandCard" src/components/admin/ThresholdSettingsForm.tsx; (>= 1)
      grep -c "BrandButton" src/components/admin/ThresholdSettingsForm.tsx; (>= 1)
      grep -c "from '@/components/ui/button'" src/components/admin/ThresholdSettingsForm.tsx; (== 0 — full conversion gate)
      grep -c "BrandCard" src/components/admin/TrendChartsClient.tsx; (>= 1)
      grep -Ec '#[0-9a-fA-F]{3,6}' src/components/admin/TrendChartsClient.tsx; (== 0 — no hardcoded hex chart colors)
      grep -c "BrandCard" "src/app/dashboard/(admin)/settings/page.tsx"; (>= 1)
      grep -c "from '@/components/ui/button'" "src/app/dashboard/(admin)/settings/page.tsx"; (== 0 — full conversion gate)
      npx vitest run; (full suite green; Phase 9 scorecard / threshold tests intact)
      npx next build 2>&1 | tail -5; (exit 0)
    </automated>
  </verify>
  <done>ThresholdSettingsForm + TrendChartsClient + settings page re-skinned; chart colors token-bound (no hardcoded hex); ZERO raw `from '@/components/ui/button'` imports remain; D-83/D-84 default value logic + zod schema + server action untouched; full vitest green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user → people / records / submission detail | Existing — auth + tenant scope unchanged; Phase 13 does not touch data-fetch paths |
| user → ThresholdSettingsForm | Existing — server action authorization unchanged |
| user → records/[id] detail | Existing — auth + tenant scope in canonical submission fetch unchanged |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-13-03b-TAB | Reverse tabnabbing | `<a target="_blank">` on photo view link in SubmissionDetailView | mitigate | Task 1 Step 6 explicit grep gate on `target="_blank"` + `rel="noopener noreferrer"` preservation |
| T-13-03b-XSS | XSS | `materialSnapshot` / worker name / notes rendered in SubmissionDetailView + ActivityTimeline | accept | React auto-escapes; no `dangerouslySetInnerHTML` introduced |
| T-13-03b-AUTH | Authorization | Tenant threshold settings server action | accept | Out of scope — restyling does not touch the server action wiring |
| T-13-03b-CHART | Information Disclosure | TrendChartsClient hardcoded-color regression | mitigate | Task 2 grep gate asserts zero hardcoded hex values (`grep -Ec '#[0-9a-fA-F]{3,6}'` == 0); all chart colors flow from Wave 1 token cascade |
</threat_model>

<verification>
- VALIDATION.md Manual UAT row "Wave 3 directory + settings re-skin holds the language" SATISFIED on Wave 3 merge (final UAT at Wave 4 covers visual sign-off).
- Per-file raw shadcn Button + Badge import gates (== 0) prevent partial conversions.
- TrendChartsClient hardcoded-hex audit gate prevents accidental chart-color drift away from Wave 1 cascade.
- SubmissionDetailView reverse-tabnabbing mitigation preserved via grep gate.
</verification>

<success_criteria>
- BRAND-02: People directory + profile + records list/detail + submission detail + settings + threshold form + trend charts + leaderboard sort + activity timeline all render via brand primitives; no shadow/lg-radius/p-6 utility classes remain; no raw `from '@/components/ui/button'` or `/ui/badge` imports remain in any converted file.
- Charts inherit token cascade — no hardcoded hex colors in TrendChartsClient.
- Reverse-tabnabbing mitigation preserved in SubmissionDetailView.
- Full vitest suite green; next build exits 0.
</success_criteria>

<output>
Create `.planning/phases/13-ux-brand-pass/13-03b-SUMMARY.md` when done. Record: count of files re-skinned (target 10), TrendChartsClient hardcoded-hex grep result (target 0), reverse-tabnabbing grep result on SubmissionDetailView (target >= 1), and raw-shadcn-Button-import counts (all 0).
</output>
