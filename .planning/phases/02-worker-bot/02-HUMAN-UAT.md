---
status: partial
phase: 02-worker-bot
source: [02-VERIFICATION.md]
started: 2026-05-24T14:45:00Z
updated: 2026-05-24T14:45:00Z
---

## Current Test

[awaiting human testing — requires a live Telegram client + real device]

## Tests

### 1. Live `/start` greeting
expected: Worker sends `/start`; bot replies in Turkish greeting them by name and shows their assigned projects as an inline keyboard (SC1, LOG-01, LOG-02).
result: [pending]

### 2. Full six-step submission flow (live)
expected: Worker completes project → BOQ item → photo (real camera) → location (native Telegram share) → quantity → notes → confirm; photo uploads to Vercel Blob; confirm shows the captured photo + a readable summary (project/BOQ names, not UUIDs); tapping confirm replies "Gönderildi ✅" and the submissions row appears with status `pending_audit` (SC3, LOG-03..LOG-08).
result: [pending]

### 3. Input enforcement (visual)
expected: Sending text at the photo step, typed coordinates at the location step, and a non-numeric quantity each produce a Turkish reprompt with emoji affordance cues, and the step does NOT advance (SC2, LOG-09, I18N-01).
result: [pending]

### 4. Cold-start resume (live)
expected: Begin a flow, force a real Vercel serverless cold start, then send the next message; the bot resumes at the correct step (re-rendering the keyboard for project/BOQ/confirm steps) with no data loss (SC5, LOG-10).
result: [pending]

### 5. Devam/Baştan mid-flow (D-15)
expected: With a flow in progress, sending `/start` shows the "Devam et / Baştan başla" two-button inline keyboard; Devam resumes at the saved step, Baştan restarts cleanly.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
