INSERT INTO "creator_tracking_links" (
	"id",
	"social_account_id",
	"slug",
	"public_url",
	"deep_link_base_url",
	"ios_app_store_url",
	"is_active"
)
SELECT
	gen_random_uuid()::text,
	account."id",
	account."platform"::text || '-' || regexp_replace(lower(account."handle"), '[^a-z0-9._-]+', '-', 'g') || '-' || left(account."id", 8),
	'https://www.mogging.com/r/' || account."platform"::text || '-' || regexp_replace(lower(account."handle"), '[^a-z0-9._-]+', '-', 'g') || '-' || left(account."id", 8),
	'mogging://attribution',
	'https://apps.apple.com/us/app/mogging-face-rating/id6771414050?ct=' || left(account."platform"::text || '-' || regexp_replace(lower(account."handle"), '[^a-z0-9._-]+', '-', 'g') || '-' || left(account."id", 8), 40),
	true
FROM "creator_social_accounts" account
ON CONFLICT ("social_account_id") DO UPDATE SET
	"is_active" = true,
	"updated_at" = now();
