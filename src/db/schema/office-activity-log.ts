import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './auth';        // Auth.js users — text PK (NOT people.id)
import { tenants } from './tenants';
import { projects } from './projects';

// Narrow event taxonomy — extend by adding values here, never in ad-hoc log calls.
// text (not pg enum) — adding new values does not require a schema migration.
export const OFFICE_ACTION_TYPES = [
  'project_created',
  'project_updated',
  'project_deleted',
  'boq_item_created',
  'boq_item_updated',
  'boq_item_deleted',
  'boq_imported',
  'unit_price_set',
  'route_uploaded',
  'person_approved',
  'person_assigned',
  'person_unassigned',
  'hakedis_period_created',
  'hakedis_period_finalized',
  'hakedis_exported',
] as const;

export type OfficeActionType = (typeof OFFICE_ACTION_TYPES)[number];

// KVKK (Turkish data protection law) retention intent: 90-day rolling window.
// Automated cleanup (delete rows older than 90 days) is out of scope for this phase —
// a scheduled job or Vercel Cron task should be implemented in a future maintenance phase.
export const officeActivityLog = pgTable('office_activity_log', {
  id:           uuid('id').primaryKey().defaultRandom(),
  tenantId:     uuid('tenant_id').references(() => tenants.id),              // nullable D-09
  // FK to Auth.js users table — text PK, NOT people.id (uuid)
  // Office engineers authenticate via Auth.js; field workers/auditors use the people table.
  actorUserId:  text('actor_user_id').notNull().references(() => users.id),
  actionType:   text('action_type').notNull(),    // one of OFFICE_ACTION_TYPES
  entityType:   text('entity_type').notNull(),    // 'project' | 'boq_item' | 'person' | 'hakedis_period'
  entityId:     text('entity_id'),               // uuid of affected row; nullable for bulk ops
  projectId:    uuid('project_id').references(() => projects.id),  // nullable for cross-project actions
  metadata:     jsonb('metadata'),               // structured context (see examples in RESEARCH.md)
  occurredAt:   timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('office_activity_log_actor_idx').on(t.actorUserId),
  index('office_activity_log_project_idx').on(t.projectId),
  index('office_activity_log_action_idx').on(t.actionType),
  index('office_activity_log_occurred_idx').on(t.occurredAt),
]);
