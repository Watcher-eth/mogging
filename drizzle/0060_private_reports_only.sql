-- Retire publication without deleting reports or their owners' access.
ALTER TABLE photos ADD CONSTRAINT photos_private_reports_only CHECK (NOT is_public) NOT VALID;
--> statement-breakpoint
UPDATE photos SET is_public = false, updated_at = now() WHERE is_public;
--> statement-breakpoint
ALTER TABLE photos VALIDATE CONSTRAINT photos_private_reports_only;
