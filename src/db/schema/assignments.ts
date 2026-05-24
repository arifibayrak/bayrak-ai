import { pgTable, uuid, text, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { people } from './people';
import { projects } from './projects';
import { tenants } from './tenants';

// Role per assignment, not per person — D-03:
// same person can be worker on one project, auditor on another
export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  roleOnProject: text('role_on_project', { enum: ['worker', 'auditor'] }).notNull(),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique('unique_person_project_role').on(t.personId, t.projectId, t.roleOnProject),
  index('assignments_project_idx').on(t.projectId),
  index('assignments_person_idx').on(t.personId),
]);
