-- v5: worker-selected auditor. When a project has multiple auditors, the worker
-- picks which one reviews the submission; fanOutToAuditors routes to this person
-- only (null = fall back to all auditors = legacy behavior). Additive, nullable.
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "assigned_auditor_person_id" uuid REFERENCES "people"("id");
