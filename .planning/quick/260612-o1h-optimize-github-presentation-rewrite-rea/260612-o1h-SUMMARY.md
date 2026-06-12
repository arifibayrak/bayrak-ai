---
phase: quick-260612-o1h
plan: "01"
subsystem: dx-presentation
tags: [readme, agents, github-metadata, documentation]
dependency_graph:
  requires: []
  provides: [README.md, AGENTS.md, github-repo-metadata]
  affects: [github-presentation, ai-agent-onboarding]
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - AGENTS.md
  modified:
    - README.md
decisions:
  - "README.md is the human-facing entry point; AGENTS.md is the cross-tool agent entry point — kept separate so each can be optimised for its audience"
  - "AGENTS.md is deliberately thin and pointer-based — no stack tables duplicated from CLAUDE.md"
  - "AI Vision Assist described as eval-gated/dormant in README.md Features section (accurate product state)"
  - "No CI badges added — project has no CI pipeline"
metrics:
  duration: ~10 minutes
  completed: "2026-06-12"
---

# Quick Task 260612-o1h: Optimize GitHub Presentation — Rewrite README + AGENTS.md

Professional GitHub presentation: replaced the create-next-app template README with a full product README, created AGENTS.md as a cross-tool agent entry point, and set GitHub repo description, homepage, and 12 topic chips via `gh` CLI.

---

## Tasks Completed

| Task | Name | Commit | Files |
|---|---|---|---|
| 1 | Rewrite README.md | a728c97 | README.md |
| 2 | Create AGENTS.md | d19f185 | AGENTS.md (new) |
| 3 | GitHub repo metadata | CLI-only (no commit) | — |

---

## What Was Done

### Task 1 — README.md (full replacement)

Replaced the default create-next-app template with a professional product README containing all 10 required sections:

1. Title + bilingual tagline ("Saha sahipleniyor — Field accountability for utility-network contractors")
2. What is bayrak.ai + core loop text diagram
3. Features (field loop, office dashboard, geospatial, billing & exports, AI assist eval-gated)
4. Tech stack table (sourced from CLAUDE.md + package.json)
5. Repository map (all real paths from plan context)
6. Getting started (copy .env.example, install, migrate, dev, `npx vitest run` with no-test-script note)
7. Documentation for AI agents (CLAUDE.md, BRAND.md, AGENTS.md, .planning/ with relative links)
8. Localization section
9. Deployment section (vercel --prod --yes, no git push)
10. Status (commercial product, single-tenant MVP, all rights reserved)

### Task 2 — AGENTS.md (new file)

Created `AGENTS.md` at repo root as a thin, pointer-based cross-tool agent context file (Codex/Cursor/Copilot/etc.):

- Project one-liner
- Commands table (dev, build, lint, migrate, `npx vitest run`)
- Canonical context pointers: CLAUDE.md, BRAND.md, .planning/
- Conventions (TypeScript, Drizzle migrations, server actions, i18n, brand primitives, money math)
- Safety notes: production DB warning, deploy-via-CLI-only, bot path isolation

### Task 3 — GitHub repo metadata (CLI-verified)

Set via authenticated `gh` CLI. Verification output:

```json
{
  "description": "Field-to-office operations platform for pipeline & utility-network subcontractors: Telegram work logging, on-site audit approval, and auto-updating Bill of Quantities, live PostGIS map, and hakkediş billing.",
  "homepageUrl": "https://www.bayrak.ai",
  "repositoryTopics": [
    {"name": "ai-sdk"},
    {"name": "construction-management"},
    {"name": "drizzle-orm"},
    {"name": "geospatial"},
    {"name": "grammy"},
    {"name": "mapbox"},
    {"name": "neon"},
    {"name": "nextjs"},
    {"name": "postgis"},
    {"name": "telegram-bot"},
    {"name": "typescript"},
    {"name": "vercel"}
  ]
}
```

All 12 topics confirmed. Description and homepage set.

---

## Deviations from Plan

None — plan executed exactly as written.

The checkpoint:human-verify (Task 3) was handled autonomously per orchestrator instructions: `gh repo edit` commands executed, verified via `gh repo view --json` with the JSON evidence captured in this SUMMARY.

---

## Known Stubs

None. This plan modifies only documentation files (README.md) and creates a new documentation file (AGENTS.md). No UI data sources or component wiring involved.

---

## Threat Flags

None. Documentation-only changes; no new network endpoints, auth paths, or schema changes introduced.

---

## Self-Check: PASSED

- README.md: exists, no create-next-app text, contains all required sections
- AGENTS.md: exists at repo root, contains all required sections
- Commits a728c97 (README) and d19f185 (AGENTS.md) confirmed in git log
- GitHub metadata confirmed via `gh repo view --json` output above
