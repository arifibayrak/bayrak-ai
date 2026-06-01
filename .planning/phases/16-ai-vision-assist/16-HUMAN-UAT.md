---
status: partial
phase: 16-ai-vision-assist
source: [16-VERIFICATION.md]
started: 2026-06-01
updated: 2026-06-01
---

## Current Test

[awaiting human testing — blocked on real approved-photo data + AI_GATEWAY_API_KEY]

## Tests

### 1. Precision eval run (AI-05) — the build-order gate
expected: With >= 30 approved submissions carrying a photoUrl in the DB, the office engineer labels `tests/fixtures/ai-vision/fixtures.json` (groundTruth per photo, >= 5-10 anomalies), then `AI_EVAL_ENABLED=true AI_GATEWAY_API_KEY=<key> npx vitest run tests/ai-vision.test.ts -t "precision"` reports precision >= 0.80 on the "anomaly" class. On pass, `psql $DATABASE_URL < scripts/set-eval-passed.sql` opens the gate (sets `eval_passed=true` where `anomaly_detected=true`). Full runbook: 16-04-SUMMARY.md. Until this runs, the gate stays closed and no flags display (intended fail-safe).
result: [pending — dev DB currently has 0 approved photos]

### 2. SC2 — webhook responds before AI analysis (AI-04 runtime proof)
expected: After an auditor approves a submission via Telegram, Vercel function logs show the HTTP 200 webhook-response line BEFORE any AI analysis log line — proving vision runs off the critical path and never delays worker confirmation / auditor notification.
result: [pending — needs a live Telegram approval + Vercel log inspection]

### 3. Visual + bilingual UAT of the flag UI (AI-01/AI-02/AI-03 display)
expected: Once an `eval_passed=true` flag exists (after test 1): the submission detail page renders `AiFlagCard` with the Turkish anomaly description, a traffic-light confidence badge, and the suggested BOQ material classification; the as-built strip shows the amber indicator with a working tooltip; the EN locale toggles heading/badge/label text; and a submission with no eval-passed flag renders zero DOM (no card, no dot). No approve/reject affordance anywhere on the card (AI-03).
result: [pending — depends on test 1 opening the gate]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
