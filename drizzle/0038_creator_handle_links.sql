CREATE TABLE "creator_tracking_link_aliases" (
	"slug" text PRIMARY KEY NOT NULL,
	"tracking_link_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_tracking_link_aliases" ADD CONSTRAINT "creator_tracking_link_aliases_tracking_link_id_creator_tracking_links_id_fk" FOREIGN KEY ("tracking_link_id") REFERENCES "public"."creator_tracking_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_tracking_link_aliases_link_idx" ON "creator_tracking_link_aliases" USING btree ("tracking_link_id");