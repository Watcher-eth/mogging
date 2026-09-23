# Report publication

New analysis photos are private by default in the input schema and database. Curated imports can explicitly publish. The one-time cleanup on 2026-09-22 made 311 existing user photos private (the two originally reported photos were already private); it did not delete evaluations or change curated entries. Do not repeat that cleanup during deployment: later explicit opt-ins must survive.

Publishing is a per-photo owner-authorized POST to `/api/photos/privacy`. Both web cookies and mobile bearer sessions are accepted. The mobile report checkbox reads current server state on focus, saves only after a tap, and reports failures without claiming publication succeeded. The former global local-only public-profile preference has been removed.

`/api/analysis/:id` serves public reports to visitors and private reports to their owner, using the same mobile/web identity resolver. Anonymous ownership is checked only for photos without an account owner. Responses use `private, no-store` and include `canManage`; public viewers cannot operate the web publication control. The leaderboard links directly to the selected analysis ID without a login redirect. Public leaderboard API responses are not cached so revocation does not linger in new responses.

Validation: photo default/access tests, route publication/revocation regression test, web/mobile TypeScript checks, 59 mobile tests, and a local browser check of the exact public report URL while logged out.

The database default was applied directly during containment; migration 0033 makes that default reproducible and leaves existing rows untouched. Code deployment is still required. Mobile UI changes require a mobile app release.
