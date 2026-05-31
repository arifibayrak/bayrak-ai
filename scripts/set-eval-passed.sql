-- set-eval-passed.sql
--
-- One-time SQL script to open the AI vision eval gate after the eval harness
-- confirms precision >= 0.80 on a labeled fixture dataset (AI-05 / REVIEWS HIGH-3).
--
-- WHEN TO RUN:
--   Run this script ONCE, after `AI_EVAL_ENABLED=true npx vitest run tests/ai-vision.test.ts -t "precision"`
--   exits 0 with precision >= 0.80. Do NOT run before the eval passes.
--
-- WHAT IT DOES:
--   Sets eval_passed = true on all submission_ai_flags rows where:
--     - status = 'done'     (analysis completed, not pending/error)
--     - anomaly_detected = true
--
--   WHY keyed on anomaly_detected (not photo_anomaly_score):
--   anomaly_detected is the multi-signal gate column written by isAnomalous() — it
--   reflects ALL four anomaly signals (photoMismatch | photoQualityFlag |
--   locationOpinion='inconsistent' | isDuplicate). Keying on photo_anomaly_score
--   alone would miss quality/location/duplicate-only advisories (D-01 / D-03 /
--   REVIEWS HIGH-3). The eval precision gate measured the anomaly class as a whole,
--   so all rows where that class fired should be made visible.
--
-- SPOT-CHECK AFTER RUNNING:
--   SELECT count(*) FROM submission_ai_flags WHERE eval_passed = true;
--   -- Should be > 0 if any approved submissions have been analysed with anomaly detected.
--
-- SCOPE:
--   materialSuggestion (AI-02) is an advisory display field, NOT an anomaly signal.
--   It does NOT contribute to anomaly_detected. Flags shown solely because of
--   materialSuggestion will NOT be opened by this script (correct per Plan 04 MEDIUM-5).

UPDATE submission_ai_flags
SET    eval_passed = true
WHERE  status          = 'done'
  AND  anomaly_detected = true;
