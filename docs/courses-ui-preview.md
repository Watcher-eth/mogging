# Course development and verification

Use `bun run dev:courses` and open **http://127.0.0.1:3003/courses**. The isolated local server uses `mogging_courses_dev` on PostgreSQL port 55432, separate browser cookies, and `.next-course-dev`. `bun run setup:courses-dev` bootstraps only an empty dedicated local database and writes fixture credentials to ignored `.local/course-accounts.json`; it never resets existing data. Configure `COURSE_DEV_DATABASE_URL` only when using another dedicated local PostgreSQL instance.

The normal application retains its original database and `COURSES_ENABLED=false`. Every course UI page has a development-only route guard and `noindex, nofollow`. Production pages return 404 even if courses are enabled. The main application navigation has no courses link. Removing that guard and adding navigation is a deliberate launch step after staging verification.

## Connected pages

- `/courses`: API catalog, category filters/search, and sample visual fixtures only when the catalog is empty. Sample purchases are disabled.
- `/courses/{seller}/{slug}`: public course projection, verified-email checkout, free enrollment, and hosted Stripe Checkout.
- `/courses/library`: authenticated enrollments and database progress.
- `/courses/learn/{courseId}`: enrollment-gated lessons, private attachments, signed Bunny playback, automatic completion, and persisted progress. Existing enrollment remains valid after a creator archives a course, unless access expires or content is blocked.
- `/creator/courses`: seller setup, account-scoped Stripe onboarding/OAuth, database course drafts, revenue, orders, and refunds.
- `/creator/courses/{courseId}`: serialized versioned autosave, lesson ordering, course details/pricing, uploads, owner preview, and submission for review. Header navigation flushes pending edits before leaving.
- `/admin/courses`: existing administrator sign-in/password-unlock controls, seller approval, private lesson previews, and version-specific course review.

One draft writer owns persistence. Failed validation and conflicts retain edits and show an error; newer versions are never guessed. Route changes flush pending edits. Publication is reviewed separately, so draft changes do not silently modify purchased content. Large files upload directly to Bunny/R2 rather than passing through the application server. Interrupted pending uploads can resume by selecting the original file, renewing the existing reservation; Bunny TUS resumes stored upload progress. Only approved sellers may upload media, with server-enforced quotas and provider-side file verification.

Written lessons use a lazy-loaded Tiptap editor with slash commands, Markdown shortcuts/paste, headings, lists, quotes, code, dividers, hosted images, links, bold/italic, highlights, and undo/redo. This follows Notion's editing conventions, not its complete feature set. One Markdown body is persisted, with sanitized rendering shared by previews and lessons. Inline images currently use HTTPS URLs; managed inline image uploads remain a follow-up.

Bunny uses one origin- and iframe-checked Player.js message listener with cleanup. Nonoverlapping playback intervals count toward 95% completion; seeking through unwatched content does not count. Coverage is stored on the server and merged across sessions and concurrent requests, including saves when pausing or switching lessons. The server derives video completion from that coverage and the provider's exact duration. Replacing a lesson's video resets its progress. Reading lessons complete when their end is visible. Completed progress cannot be undone by a late incomplete save.

## UI and motion

Course workspaces share page gutters, white sidebars, light dividers, consistent top alignment, and responsive collapsed outlines. Only `/courses` has a footer. Lesson rows use protected provider thumbnails. The shared outline supports pointer/keyboard ordering, including empty chapters, with one immutable reorder function. Long card metadata stays on one line and truncates while preserving full labels. Catalog search/filtering runs on the server; the catalog, learning library, creator orders and student lists are paginated. Creators can archive courses and view student access; administrators can separately control listing, sales and content access.

The existing white/light-gray design uses bounded progressive blur behind image captions, white fades, glass-style controls, rounded imagery, price pills, and reduced-motion-aware transitions. Motion Primitives' MIT notice is in `motion-primitives-license.md`. The retired local-video poster/WebGL snapshot renderer and browser-storage draft/progress hooks were removed after the provider integration.

## Verification — October 2, 2026

- Production build, typecheck, targeted ESLint, and 17 draft/editor/validation/watch-progress tests pass. Every course page returned 404 in the local production build; the normal app also keeps `/courses` hidden. The broader repository test run is not green: creator-payment validation has a separate failing assertion, and shared provider mocks interfere across unrelated test files.
- Backend integration checks pass on a disposable local database: migration, ownership/public projection, edit conflicts, publication snapshots, checkout concurrency, refunds/disputes and recovery from a lost refund response, webhook deduplication and account isolation, expiry, media references, archived access/takedowns, email/signatures, and HTTP origin/authentication guards. These provider responses are mocked.
- Real browser checks covered database-backed creation, Markdown editing, details/pricing, saves after reload, Bunny upload/processing, free enrollment, private lesson access, and automatic playback completion.
- Real Bunny uploads finished; signed playback metadata succeeded and unsigned requests were rejected. Completed learner progress and active library membership were verified through authenticated API requests. CDN token authentication is now enabled, unsigned direct files are rejected, and embedded playback still works. Real partial playback survived a reload and completed at 95% coverage. Protected thumbnail endpoints returned images for enrolled learners/owners and rejected unauthorized users, with private caching.
- Real connected-account webhook delivery returned HTTP 200 through Stripe CLI. Signature verification uses the asynchronous Stripe SDK API for Bun compatibility, with tamper/duplicate regression coverage. The connected Stripe sandbox account was created through the backend, but its charges and payouts remain disabled pending hosted onboarding. A real paid checkout/refund remains unverified.
- Real private R2 checks passed against `mogging-course-resources`: direct upload, allowed-origin CORS, resumed reservation, provider metadata validation, enrolled download with matching bytes, rejected anonymous/unenrolled/draft/cross-course access, and rejected unsigned/tampered/expired links. Draft and published references prevent deletion; detached resources are removed from R2. A real browser attachment upload survived reload and downloaded correctly. The existing photo storage helper also uploaded and publicly served a unique synthetic image correctly; that image was removed. Repeat with `bun run test:courses-r2` against the isolated local app. Resend delivery remains deferred. See [provider setup](courses-provider-setup.md).

Before release, finish provider settings and staging purchase/refund/webhook/email/resource checks; apply the migration in staging first; establish production moderation/support and reconciliation/outbox scheduling; test responsive/accessibility/error flows against real content; then remove development guards and expose navigation. This work has not been deployed.

Sample stock photos are local Unsplash downloads used for fictional visual fixtures; they do not identify actual course creators.
