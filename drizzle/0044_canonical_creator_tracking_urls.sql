-- Keep applied migrations immutable. Correct the generated apex-domain URLs
-- introduced by 0021 in a forward migration without changing custom links.
UPDATE creator_tracking_links
SET public_url = 'https://www.mogging.com/r/' || slug,
    updated_at = now()
WHERE public_url = 'https://mogging.com/r/' || slug;
