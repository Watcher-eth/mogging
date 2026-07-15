ALTER TABLE "creator_social_accounts" ADD COLUMN "avatar_url" text;
ALTER TABLE "creator_social_accounts" ADD COLUMN "connection_method" text DEFAULT 'manual' NOT NULL;
ALTER TABLE "creator_social_accounts" ADD COLUMN "provider_account_id" text;
ALTER TABLE "creator_social_accounts" ADD COLUMN "oauth_verified_at" timestamp;
CREATE UNIQUE INDEX "creator_social_accounts_platform_provider_account_unique" ON "creator_social_accounts" USING btree ("platform", "provider_account_id");
