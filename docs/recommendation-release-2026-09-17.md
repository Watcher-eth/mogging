# Recommendation backend release — 2026-09-17

- Production: https://www.mogging.com
- Deployment: https://mogging-e0sx7rxbi-glimpseback.vercel.app
- ID: `dpl_6Nc7qogJBuvpr7XsBjnwfcdS9SLy`
- Source: verified live payment snapshot (`dpl_9u5MmqzKXavYcNFMovTK2Z1ihd16`) plus `lib/analysis/prompt.ts`, `prompt.test.ts`, and `report.ts` from `55e36a8`.
- Scope: score- and finding-specific category recommendations, general SPF 50+ skin protection guidance, Skin Age naming. No database migration.
- Validation: 4 targeted backend tests passed; Vercel production build succeeded; candidate database health passed; unauthenticated analysis returned HTTP 401; promoted successfully.
- Existing reports are not regenerated. New model output still needs qualitative review; deployment checks did not run a paid evaluation.
- Mobile action-plan filtering and the Skin Age dot overlay require an updated mobile app release and were not released through Vercel.
- Rollback: https://mogging-ayszkldqo-glimpseback.vercel.app (`dpl_9u5MmqzKXavYcNFMovTK2Z1ihd16`).
