CREATE TABLE "hakedis_line_submissions" (
	"tenant_id" uuid,
	"period_line_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"qty_contributed" numeric(12, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hakedis_line_submissions_period_line_id_submission_id_pk" PRIMARY KEY("period_line_id","submission_id")
);
--> statement-breakpoint
ALTER TABLE "hakedis_line_submissions" ADD CONSTRAINT "hakedis_line_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hakedis_line_submissions" ADD CONSTRAINT "hakedis_line_submissions_period_line_id_hakedis_period_lines_id_fk" FOREIGN KEY ("period_line_id") REFERENCES "public"."hakedis_period_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hakedis_line_submissions" ADD CONSTRAINT "hakedis_line_submissions_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hakedis_line_submissions_submission_idx" ON "hakedis_line_submissions" USING btree ("submission_id");--> statement-breakpoint
ALTER TABLE "hakedis_period_lines" ADD CONSTRAINT "hakedis_period_lines_period_boq_unique" UNIQUE("period_id","boq_item_id");