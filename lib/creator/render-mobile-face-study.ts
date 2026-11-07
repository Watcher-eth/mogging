import { basename, join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { Readable, type Writable } from 'node:stream'
import { buffer } from 'node:stream/consumers'
import { pipeline } from 'node:stream/promises'
import ffmpeg from 'ffmpeg-static'
import { ApiError } from '@/lib/api/http'
import { chromium } from 'playwright-core'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'

import { compileMobileFaceStudy, type StudyScriptContext } from './mobile-face-study'
import type { VideoComposition } from './video-composition'
import { generateCreatorSpeech } from './video-speech-server'
import { voiceDirection } from './video-speech'
import { assembleSpeech } from './video-voiceover'

export type FaceStudyRenderInput = { photo: string; face: FaceLandmarksPayload; composition: VideoComposition }

export async function renderMobileFaceStudy(
  { photo, face, id, script, narrated }: { photo: string; face: FaceLandmarksPayload; id: string; script?: StudyScriptContext; narrated: boolean },
  origin: string,
) {
  const startedAt = Date.now()
  const encodeDeadline = startedAt + 540_000
  let composition = compileMobileFaceStudy(face, id, script)
  let audio: Buffer | undefined
  if (narrated) {
    const voice = voiceDirection('editorial')
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(140_000)])
    const segments = await Promise.all(composition.scenes.map(async scene => {
      const speech = await generateCreatorSpeech(scene.narration, voice, scene.delivery, signal)
      return { sceneId: scene.id, pcm: Buffer.from(speech.audio, 'base64'), words: speech.words }
    })).catch(error => {
      controller.abort()
      throw error
    })
    const assembled = assembleSpeech(composition, segments)
    composition = assembled.composition
    audio = Buffer.from(await assembled.file.arrayBuffer())
  }
  const speechMs = Date.now() - startedAt
  const video = await encodeFaceStudy({ photo, face, composition }, origin, encodeDeadline)
  const renderMs = Date.now() - startedAt - speechMs
  const delivery = await encodeDeliveryVideo(video, audio)
  console.info('Portrait study rendered', { speechMs, renderMs, deliveryMs: Date.now() - startedAt - speechMs - renderMs, bytes: delivery.byteLength })
  return { video: delivery, chapterStarts: composition.scenes.map(scene => scene.startMs / 1000) }
}

async function encodeFaceStudy(input: FaceStudyRenderInput, origin: string, deadline: number) {
  const executablePath = process.env.FACE_STUDY_CHROME_PATH
    || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined)
  const serverless = !executablePath && process.env.VERCEL ? (await import('@sparticuz/chromium')).default : undefined
  const browser = await chromium.launch({
    executablePath: executablePath ?? await serverless?.executablePath(),
    timeout: 20_000,
    args: [...(serverless?.args ?? []), '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas'],
  })
  const timeout = setTimeout(() => void browser.close().catch(() => {}), Math.max(1, deadline - Date.now()))
  try {
    const page = await browser.newPage()
    if (process.env.VERCEL) await page.routeWebSocket(/.*/, socket => socket.close())
    const allowedOrigin = new URL(origin).origin
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      // The existing cutout model loads its pinned MediaPipe WASM runtime.
      const segmentationRuntime = url.origin === 'https://cdn.jsdelivr.net'
        && /^\/npm\/@mediapipe\/tasks-vision@0\.10\.35\/wasm\/vision_wasm_[a-z_]+\.(?:js|wasm)$/.test(url.pathname)
      if (segmentationRuntime) return route.fulfill({
        path: join(process.cwd(), 'node_modules/@mediapipe/tasks-vision/wasm', basename(url.pathname)),
        contentType: url.pathname.endsWith('.wasm') ? 'application/wasm' : 'application/javascript',
        headers: { 'access-control-allow-origin': allowedOrigin },
      })
      if (url.origin === allowedOrigin) {
        const bypass = allowedOrigin === `https://${process.env.VERCEL_URL}`
          ? process.env.VERCEL_AUTOMATION_BYPASS_SECRET
          : undefined
        if (!bypass) return route.continue()
        const response = await route.fetch({
          headers: { ...route.request().headers(), 'x-vercel-protection-bypass': bypass },
          maxRedirects: 0,
        })
        return route.fulfill({ response })
      }
      return ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort()
    })
    const response = await page.goto(new URL('/__face-study-render', origin).href, { waitUntil: 'domcontentloaded', timeout: 25_000 })
    if (!response?.ok()) throw new Error(`Portrait renderer returned HTTP ${response?.status() ?? 'unknown'}.`)
    await page.waitForFunction(() => typeof window.renderPrivateFaceStudy === 'function', undefined, { timeout: 25_000 })
    return Buffer.from(await page.evaluate(args => window.renderPrivateFaceStudy!(args), input), 'base64')
  } catch (error) {
    if (Date.now() >= deadline) throw new ApiError(503, 'The portrait study took too long to render. Please try again.')
    throw error
  } finally {
    clearTimeout(timeout)
    await browser.close().catch(() => {})
  }
}

async function encodeDeliveryVideo(video: Buffer, audio?: Buffer) {
  if (!ffmpeg) throw new Error('The portrait video encoder is unavailable.')
  const encoder = spawn(ffmpeg, [
    '-nostdin', '-loglevel', 'error', '-f', 'ivf', '-i', 'pipe:0',
    ...(audio ? ['-f', 'wav', '-i', 'pipe:3', '-map', '1:a:0', '-c:a', 'aac', '-b:a', '96k'] : []),
    '-map', '0:v:0', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-movflags', '+frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1',
  ], { stdio: ['pipe', 'pipe', 'pipe', audio ? 'pipe' : 'ignore'], signal: AbortSignal.timeout(45_000) })
  const { stdin, stdout, stderr } = encoder
  if (!stdin || !stdout || !stderr) throw new Error('The portrait encoder pipes are unavailable.')
  let diagnostic = ''
  stderr.setEncoding('utf8').on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-4000) })
  try {
    const [[code], output] = await Promise.all([
      once(encoder, 'close'),
      buffer(stdout),
      pipeline(Readable.from([video]), stdin),
      audio && pipeline(Readable.from([audio]), encoder.stdio[3] as Writable),
    ])
    if (code !== 0 || !output.length) throw new Error(`Portrait video encoding failed (${code}): ${diagnostic}`)
    return output
  } finally {
    if (encoder.exitCode === null) encoder.kill()
  }
}
