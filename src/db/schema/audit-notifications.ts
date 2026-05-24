// audit_notifications stores the (chat_id, message_id) for every auditor fan-out
// message sent on worker confirm. Used to edit all sibling messages on first decision (D-34).
// D-40: sendFailed records best-effort failure without blocking other auditors.
import { pgTable, uuid, bigint, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { submissions } from './submissions';
import { people } from './people';

export const auditNotifications = pgTable('audit_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id), // nullable D-09 (matches all other tables)
  submissionId: uuid('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  auditorPersonId: uuid('auditor_person_id').notNull().references(() => people.id),
  // bigint matches people.telegram_user_id convention (conversation-state.ts line 12)
  chatId: bigint('chat_id', { mode: 'bigint' }).notNull(),
  // Telegram message_id is a 32-bit integer within a chat
  messageId: integer('message_id').notNull(),
  sendFailed: boolean('send_failed').notNull().default(false), // D-40: record best-effort failures
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('audit_notifications_submission_idx').on(t.submissionId),
  index('audit_notifications_auditor_idx').on(t.auditorPersonId),
]);
