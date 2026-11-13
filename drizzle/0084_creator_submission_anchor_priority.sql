SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "creator_submissions"
  ADD COLUMN "tiktok_anchor_linked" boolean DEFAULT false NOT NULL;
