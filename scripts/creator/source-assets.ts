import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { mediaAssetSchema, mediaCropFit, requireUsableMedia, type MediaAsset } from '../../lib/creator/media-asset'
import { searchMedia } from '../../lib/creator/media-sources'

const [command, ...args] = Bun.argv.slice(2)
const option = (name: string, fallback = '') => { const index = args.indexOf('--' + name); return index < 0 ? fallback : args[index + 1] ?? fallback }
async function exec(command: string[]) { const process = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' }); const [code, output, error] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()]); if (code) throw new Error(error.slice(-1000)); return output }
async function acquire(asset: MediaAsset, out: string) {
  requireUsableMedia(asset)
  if (asset.scope.kind !== 'public') throw new Error('Private uploads belong to the authenticated creator upload flow')
  const url = new URL(asset.url), allowed = ['upload.wikimedia.org', 'images.pexels.com', 'videos.pexels.com', 'raw.githubusercontent.com']
  if (url.protocol !== 'https:' || !allowed.includes(url.hostname)) throw new Error('Acquire only original files from a supported source')
  const response = await fetch(url, { signal: AbortSignal.timeout(90000), redirect: 'error' })
  if (!response.ok || !response.body) throw new Error(`Source download failed (${response.status})`)
  const limit = 250 * 1024 * 1024
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Choose a source master smaller than 250 MB')
  const chunks: Uint8Array[] = [], reader = response.body.getReader(); let size = 0
  for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > limit) { await reader.cancel(); throw new Error('Source master exceeds 250 MB') } chunks.push(part.value) }
  const bytes = Buffer.concat(chunks), sha256 = createHash('sha256').update(bytes).digest('hex'), directory = resolve(out, sha256)
  await mkdir(directory, { recursive: true })
  const extension = asset.kind === 'video' ? 'mp4' : asset.kind === 'model' ? 'glb' : (await sharp(bytes).metadata()).format ?? 'jpg'
  const master = directory + '/master.' + extension
  if (!await Bun.file(master).exists()) await Bun.write(master, bytes)
  let width = asset.kind === 'model' ? undefined : asset.width, height = asset.kind === 'model' ? undefined : asset.height, durationMs = asset.durationMs
  if (asset.kind === 'image') {
    const meta = await sharp(bytes).metadata(), rotated = [5, 6, 7, 8].includes(meta.orientation ?? 1); width = rotated ? meta.height : meta.width; height = rotated ? meta.width : meta.height
    await sharp(bytes).rotate().resize({ width: 1280, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toFile(directory + '/preview.webp')
  } else if (asset.kind === 'video') {
    const probe = JSON.parse(await exec(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', master])), video = probe.streams.find((stream: any) => stream.codec_type === 'video')
    if (!video) throw new Error('Source master has no video stream')
    width = video.width; height = video.height; durationMs = Math.round(Number(probe.format.duration) * 1000)
    await exec(['ffmpeg', '-v', 'error', '-y', '-i', master, '-an', '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-movflags', '+faststart', directory + '/preview.mp4'])
  }
  const record = mediaAssetSchema.parse({ ...asset, url: `/asset-library/${sha256}/master.${extension}`, ...(asset.kind === 'model' ? {} : { width, height }), durationMs, sha256 })
  await Bun.write(directory + '/asset.json', JSON.stringify(record, null, 2))
  console.log(JSON.stringify({ id: asset.id, directory, source: asset.source.url, sha256, fit: record.kind === 'model' ? null : mediaCropFit(record, { width: 1080, height: 1920 }, undefined, Number(option('zoom', '1'))) }, null, 2))
}
if (command === 'search') {
  const provider = option('provider', 'commons')
  if (provider !== 'commons' && provider !== 'pexels') throw new Error('Choose commons or pexels')
  const results = await searchMedia(option('query'), provider, { pexelsKey: process.env.PEXELS_API_KEY, signal: AbortSignal.timeout(30000) })
  const out = option('out')
  if (out) await Bun.write(out, JSON.stringify(results, null, 2))
  console.log(results.map(asset => `${asset.id}\t${asset.width}×${asset.height}\t${asset.source.license}\t${asset.source.url}`).join('\n'))
} else if (command === 'acquire') {
  const record = mediaAssetSchema.parse(await Bun.file(option('manifest')).json())
  await acquire(record, option('out', 'private/creator/asset-library'))
} else throw new Error('Use search --query "..." --provider commons --out candidates.json; then acquire --manifest reviewed-asset.json --out asset-library')
