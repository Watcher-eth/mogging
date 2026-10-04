CREATE TABLE "creator_submission_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"author_user_id" text,
	"author_role" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creator_submission_messages_role_check" CHECK ("creator_submission_messages"."author_role" in ('creator', 'team')),
	CONSTRAINT "creator_submission_messages_body_check" CHECK (length(trim("creator_submission_messages"."body")) > 0)
);
--> statement-breakpoint
ALTER TABLE "creator_submissions" ADD COLUMN "creator_messages_read_at" timestamp;--> statement-breakpoint
ALTER TABLE "creator_submissions" ADD COLUMN "team_messages_read_at" timestamp;--> statement-breakpoint
ALTER TABLE "creator_submission_messages" ADD CONSTRAINT "creator_submission_messages_submission_id_creator_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."creator_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_submission_messages" ADD CONSTRAINT "creator_submission_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_submission_messages_thread_idx" ON "creator_submission_messages" USING btree ("submission_id","created_at","id");--> statement-breakpoint
INSERT INTO creator_submission_messages (id, submission_id, author_role, body, created_at)
SELECT 'legacy-review-' || id, id, 'team', trim(review_note), updated_at
FROM creator_submissions WHERE nullif(trim(review_note), '') IS NOT NULL
ON CONFLICT (id) DO NOTHING;
