CREATE TABLE "mobile_creator_attributions" (
	"id" text PRIMARY KEY NOT NULL,
	"mobile_install_id" text NOT NULL,
	"tracking_link_id" text NOT NULL,
	"click_id" text NOT NULL,
	"first_tracking_link_id" text NOT NULL,
	"first_click_id" text NOT NULL,
	"attribution_key" text NOT NULL,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mobile_creator_attributions" ADD CONSTRAINT "mobile_creator_attributions_tracking_link_id_creator_tracking_links_id_fk" FOREIGN KEY ("tracking_link_id") REFERENCES "public"."creator_tracking_links"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mobile_creator_attributions" ADD CONSTRAINT "mobile_creator_attributions_click_id_creator_attribution_clicks_id_fk" FOREIGN KEY ("click_id") REFERENCES "public"."creator_attribution_clicks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mobile_creator_attributions" ADD CONSTRAINT "mobile_creator_attributions_first_tracking_link_id_creator_tracking_links_id_fk" FOREIGN KEY ("first_tracking_link_id") REFERENCES "public"."creator_tracking_links"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mobile_creator_attributions" ADD CONSTRAINT "mobile_creator_attributions_first_click_id_creator_attribution_clicks_id_fk" FOREIGN KEY ("first_click_id") REFERENCES "public"."creator_attribution_clicks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mobile_creator_attributions" ADD CONSTRAINT "mobile_creator_attributions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "mobile_creator_attributions_link_id_idx" ON "mobile_creator_attributions" USING btree ("tracking_link_id");
--> statement-breakpoint
CREATE INDEX "mobile_creator_attributions_click_id_idx" ON "mobile_creator_attributions" USING btree ("click_id");
--> statement-breakpoint
CREATE INDEX "mobile_creator_attributions_user_id_idx" ON "mobile_creator_attributions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "mobile_creator_attributions_mobile_install_id_idx" ON "mobile_creator_attributions" USING btree ("mobile_install_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_creator_attributions_install_click_unique" ON "mobile_creator_attributions" USING btree ("mobile_install_id","click_id");
