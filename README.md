# moggingnew

Backend-first rebuild of the mogging app with Next.js Pages Router, TypeScript, NextAuth, Postgres, Drizzle, and Kimi/Moonshot image analysis.

## Local Environment

Create `.env.local` for local development or `.env` for one-off Bun scripts. Use `.env.example` as the source of truth.

Required for a working backend:

- `DATABASE_URL`: Railway Postgres connection string.
- `NEXTAUTH_SECRET`: required in production, recommended locally.
- `NEXTAUTH_URL`: required in production for auth callbacks.
- `MOONSHOT_API_KEY`: required for image analysis.
- `MOONSHOT_BASE_URL`: defaults to `https://api.moonshot.ai/v1`.
- `KIMI_ANALYSIS_MODEL`: defaults to `kimi-k2.5`.

Optional:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: enable Google OAuth when both are present.
- `IMAGE_STORAGE_DIR` and `IMAGE_PUBLIC_BASE_URL`: default to local `public/uploads`.
- `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_PUBLIC_BASE_URL`: enable Cloudflare R2 image storage.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: enable durable shared rate limiting. Local dev falls back to memory.

## Setup

```bash
bun install
bun run env:check
bun run db:push
bun run db:health
bun run test
bun run typecheck
bun run build
```

After schema changes, run `bun run db:push` locally against the intended Railway database.

## Health

`GET /api/health` returns a consistent API envelope:

```json
{
  "data": {
    "ok": true,
    "database": { "ok": true },
    "config": { "ok": true, "checks": [] }
  }
}
```

It checks DB connectivity and required provider/auth configuration without returning secret values.

## Admin Scripts

```bash
bun run user:create <email> <password> [name]
bun run seed
bun run admin:leaderboard
SMOKE_IMAGE_DATA_URL="data:image/jpeg;base64,..." bun run smoke:analysis
```

`smoke:analysis` requires a real face image data URL and a running dev server.

## API Contract

Successful API responses use:

```json
{ "data": {} }
```

Errors use:

```json
{ "error": { "code": "bad_request", "message": "Invalid request" } }
```

## Production Notes

- Current rate limiting is best-effort in-memory protection for local/single-instance runtime. Use a shared store before high-traffic production.
- Production rate limiting uses Upstash Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. Upstash is the cheapest practical Redis option for this workload: free up to 500K monthly commands, then pay-as-you-go at $0.20 per 100K commands.
- Production image storage uses Cloudflare R2 when all `R2_*` variables are configured. Local image storage writes to `public/uploads`.
- Analysis provider failures are classified and persisted on failed analysis rows when the image upload succeeds.

## Cloudflare R2

Create an R2 bucket and an R2 API token with object read/write access. Configure:

```bash
R2_ACCOUNT_ID="..."
R2_BUCKET_NAME="mogging-images"
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_PUBLIC_BASE_URL="https://your-public-r2-domain.example.com"
```

`R2_PUBLIC_BASE_URL` should be either a custom domain connected to the bucket or Cloudflare's public bucket URL. Uploaded images use content-hash filenames and immutable cache headers.
