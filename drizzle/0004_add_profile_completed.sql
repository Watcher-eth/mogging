ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_completed" boolean DEFAULT false NOT NULL;
