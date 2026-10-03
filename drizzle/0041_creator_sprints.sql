CREATE TABLE "creator_sprints" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"budget_cents" integer NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"terms" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_submissions" ADD COLUMN "sprint_id" text;--> statement-breakpoint
ALTER TABLE "creator_submissions" ADD COLUMN "sprint_terms" jsonb;--> statement-breakpoint
ALTER TABLE "creator_submissions" ADD COLUMN "approved_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "creator_submissions" ADD COLUMN "posted_at" timestamp;--> statement-breakpoint
ALTER TABLE "creator_submissions" ADD CONSTRAINT "creator_submissions_sprint_id_creator_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."creator_sprints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_submissions_sprint_id_idx" ON "creator_submissions" USING btree ("sprint_id");