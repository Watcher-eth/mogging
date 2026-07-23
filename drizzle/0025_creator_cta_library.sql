CREATE TYPE "public"."creator_cta_library_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "creator_cta_library_items" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_profile_id" text NOT NULL,
	"title" text NOT NULL,
	"template_id" text NOT NULL,
	"format_id" text NOT NULL,
	"asset_url" text NOT NULL,
	"asset_storage_key" text NOT NULL,
	"asset_content_type" text NOT NULL,
	"asset_size_bytes" integer NOT NULL,
	"status" "creator_cta_library_status" DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by_email" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_cta_library_items" ADD CONSTRAINT "creator_cta_library_items_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_cta_library_items_creator_profile_id_idx" ON "creator_cta_library_items" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_cta_library_items_asset_storage_key_unique" ON "creator_cta_library_items" USING btree ("asset_storage_key");--> statement-breakpoint
CREATE INDEX "creator_cta_library_items_status_idx" ON "creator_cta_library_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "creator_cta_library_items_created_at_idx" ON "creator_cta_library_items" USING btree ("created_at");
