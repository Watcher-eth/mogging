# Mobile overlay engine snapshot

These files are exact copies of `mogging-mobile/src/overlay-engine` so the standalone web deployment can render the same facial geometry without importing files outside its repository.

When the canonical mobile files change, copy `landmarks.ts`, `schema.ts`, `layout.ts`, `resolve.ts`, and `report-presets.ts` here unchanged and run the creator generator tests.
