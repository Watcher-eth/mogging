ALTER TABLE "creator_submissions" ADD COLUMN "social_account_id" text;
ALTER TABLE "creator_submissions" ADD CONSTRAINT "creator_submissions_social_account_id_creator_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."creator_social_accounts"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "creator_submissions_social_account_id_idx" ON "creator_submissions" USING btree ("social_account_id");
