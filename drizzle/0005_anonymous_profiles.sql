CREATE TABLE IF NOT EXISTS "anonymous_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"anonymous_actor_id" text NOT NULL,
	"name" text NOT NULL,
	"image" text,
	"social" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "anonymous_profiles_actor_unique" ON "anonymous_profiles" USING btree ("anonymous_actor_id");
