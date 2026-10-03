ALTER TABLE "course_assets" ALTER COLUMN "duration_seconds" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "course_progress" ADD COLUMN "video_asset_id" text;--> statement-breakpoint
ALTER TABLE "course_progress" ADD COLUMN "watched_ranges" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_video_asset_id_course_assets_id_fk" FOREIGN KEY ("video_asset_id") REFERENCES "public"."course_assets"("id") ON DELETE no action ON UPDATE no action;