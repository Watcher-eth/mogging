import { z } from 'zod'

const mediaFields = {
  id: z.string().min(1).max(160),
  url: z.string().min(1).max(2000),
  durationMs: z.number().positive().optional(),
  role: z.enum(['evidence', 'context', 'illustration']),
  source: z.object({ provider: z.string(), url: z.url(), author: z.string().optional(), license: z.string(), licenseUrl: z.url().optional(), usage: z.enum(['owned', 'licensed', 'review']) }).strict(),
  scope: z.discriminatedUnion('kind', [z.object({ kind: z.literal('public') }).strict(), z.object({ kind: z.literal('private'), ownerId: z.string().min(1) }).strict()]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  parentId: z.string().optional(), operations: z.array(z.string()).max(20).optional(),
}
const dimensions = { width: z.number().int().positive(), height: z.number().int().positive() }
export const mediaAssetSchema = z.discriminatedUnion('kind', [
  z.object({ ...mediaFields, ...dimensions, kind: z.literal('image') }).strict(),
  z.object({ ...mediaFields, ...dimensions, kind: z.literal('video'), durationMs: z.number().positive() }).strict(),
  z.object({ ...mediaFields, kind: z.literal('model') }).strict(),
])
export type MediaAsset = z.infer<typeof mediaAssetSchema>
export const documentaryShotSchema = z.object({
  kind: z.enum(['stage', 'comparison', 'inspection', 'anatomy', 'relations', 'media', 'conclusion']),
  mediaId: z.string().optional(), label: z.string().max(100),
}).strict()

// Evaluate the pixels actually used by a shot, including its largest camera move.
export function mediaCropFit(source: { width: number; height: number }, target: { width: number; height: number }, crop = { width: 1, height: 1 }, maxZoom = 1) {
  if (![source.width, source.height, target.width, target.height, crop.width, crop.height, maxZoom].every(Number.isFinite) || Math.min(source.width, source.height, target.width, target.height, crop.width, crop.height) <= 0 || crop.width > 1 || crop.height > 1 || maxZoom < 1) throw new Error('Invalid media crop dimensions')
  const coverage = Math.min(source.width * crop.width / target.width, source.height * crop.height / target.height) / maxZoom
  return { coverage, native: coverage >= 1, width: Math.round(target.width * coverage), height: Math.round(target.height * coverage) }
}

export function requireUsableMedia(asset: MediaAsset) {
  if (asset.source.usage === 'review') throw new Error(`Review usage rights before rendering ${asset.id}`)
  // Private assets travel through the authenticated creator endpoint, never a public CDN URL.
  if (asset.scope.kind === 'private' && !asset.url.startsWith('/api/creator/')) throw new Error('Private media requires an authenticated creator URL')
}
