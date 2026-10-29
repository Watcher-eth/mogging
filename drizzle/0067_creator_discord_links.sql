CREATE TABLE "creator_discord_links" (
  "user_id" text PRIMARY KEY NOT NULL,
  "discord_user_id" text NOT NULL,
  "discord_username" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_discord_links" ADD CONSTRAINT "creator_discord_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE UNIQUE INDEX "creator_discord_links_discord_user_unique" ON "creator_discord_links" ("discord_user_id");
