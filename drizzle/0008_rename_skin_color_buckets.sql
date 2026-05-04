UPDATE "photos"
SET "skin_color" = CASE "skin_color"
  WHEN 'medium' THEN 'white'
  WHEN 'deep' THEN 'brown'
  WHEN 'very_deep' THEN 'black'
  ELSE "skin_color"
END,
"updated_at" = now()
WHERE "skin_color" IN ('medium', 'deep', 'very_deep');
--> statement-breakpoint
UPDATE "users"
SET "skin_color" = CASE "skin_color"
  WHEN 'medium' THEN 'white'
  WHEN 'deep' THEN 'brown'
  WHEN 'very_deep' THEN 'black'
  ELSE "skin_color"
END,
"updated_at" = now()
WHERE "skin_color" IN ('medium', 'deep', 'very_deep');
--> statement-breakpoint
UPDATE "anonymous_profiles"
SET "skin_color" = CASE "skin_color"
  WHEN 'medium' THEN 'white'
  WHEN 'deep' THEN 'brown'
  WHEN 'very_deep' THEN 'black'
  ELSE "skin_color"
END,
"updated_at" = now()
WHERE "skin_color" IN ('medium', 'deep', 'very_deep');
