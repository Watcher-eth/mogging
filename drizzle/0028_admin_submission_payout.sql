ALTER TABLE "creator_submissions" ADD COLUMN IF NOT EXISTS "admin_view_count_threshold" integer;
ALTER TABLE "creator_submissions" ADD COLUMN IF NOT EXISTS "admin_us_audience_percent" real;
