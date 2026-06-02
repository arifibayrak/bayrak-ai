-- v5 RBAC: add role to Auth.js users.
-- admin | office_engineer | audit_engineer. Default office_engineer; @bayrak.ai
-- users are treated as admin at runtime (src/lib/authz.ts), not via this column.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'office_engineer';
