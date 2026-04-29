ALTER TABLE "analysis_shares" ADD COLUMN "owner_anonymous_actor_id" text;--> statement-breakpoint
CREATE INDEX "analyses_status_psl_created_at_idx" ON "analyses" USING btree ("status","psl_score","created_at");--> statement-breakpoint
CREATE INDEX "analysis_shares_owner_anonymous_actor_id_idx" ON "analysis_shares" USING btree ("owner_anonymous_actor_id");--> statement-breakpoint
CREATE INDEX "comparisons_anonymous_actor_id_idx" ON "comparisons" USING btree ("anonymous_actor_id");--> statement-breakpoint
CREATE INDEX "photo_ratings_conservative_display_idx" ON "photo_ratings" USING btree ("conservative_score","display_rating");--> statement-breakpoint
CREATE INDEX "photos_public_type_gender_created_at_idx" ON "photos" USING btree ("is_public","photo_type","gender","created_at");--> statement-breakpoint
CREATE INDEX "photos_user_public_created_at_idx" ON "photos" USING btree ("user_id","is_public","created_at");