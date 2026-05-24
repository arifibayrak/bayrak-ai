CREATE TABLE "conversation_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"telegram_user_id" bigint NOT NULL,
	"person_id" uuid NOT NULL,
	"flow_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"current_step" text NOT NULL,
	"data" jsonb DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_state_telegram_user_id_unique" UNIQUE("telegram_user_id")
);
--> statement-breakpoint
CREATE TABLE "processed_updates" (
	"update_id" bigint PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"flow_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"boq_item_id" uuid NOT NULL,
	"photo_url" text NOT NULL,
	"photo_file_id" text,
	"location" geometry(point),
	"location_lat" numeric(10, 7),
	"location_lon" numeric(10, 7),
	"quantity" numeric(12, 3) NOT NULL,
	"notes" text,
	"status" text DEFAULT 'pending_audit' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_flow_id_unique" UNIQUE("flow_id")
);
--> statement-breakpoint
ALTER TABLE "conversation_state" ADD CONSTRAINT "conversation_state_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_state" ADD CONSTRAINT "conversation_state_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_boq_item_id_boq_items_id_fk" FOREIGN KEY ("boq_item_id") REFERENCES "public"."boq_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_state_telegram_idx" ON "conversation_state" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE INDEX "submissions_project_idx" ON "submissions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "submissions_person_idx" ON "submissions" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "submissions_status_idx" ON "submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "submissions_location_gist" ON "submissions" USING gist ("location");