CREATE TABLE "audit_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"submission_id" uuid NOT NULL,
	"auditor_person_id" uuid NOT NULL,
	"chat_id" bigint NOT NULL,
	"message_id" integer NOT NULL,
	"send_failed" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "decided_by" uuid;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "audit_notifications" ADD CONSTRAINT "audit_notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_notifications" ADD CONSTRAINT "audit_notifications_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_notifications" ADD CONSTRAINT "audit_notifications_auditor_person_id_people_id_fk" FOREIGN KEY ("auditor_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_notifications_submission_idx" ON "audit_notifications" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "audit_notifications_auditor_idx" ON "audit_notifications" USING btree ("auditor_person_id");--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_decided_by_people_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;