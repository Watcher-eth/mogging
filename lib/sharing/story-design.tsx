import sharp from 'sharp'
import type { FaceLandmarksPayload } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { ShareOverallOverlay } from './overall-overlay'

const portraitSize = { width: 936, height: 1536 } as const

export type StoryDesign = 'original' | 'precision' | 'afterimage'
export function parseStoryDesign(value: unknown): StoryDesign {
  return value === 'precision' || value === 'afterimage' ? value : 'original'
}

// Fetch once, resize before rendering, and keep the source private (no shared image cache).
export async function prepareStoryPortrait(imageUrl: string, design: Exclude<StoryDesign, 'original'>) {
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error('Share portrait unavailable')
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > 12 * 1024 * 1024) throw new Error('Share portrait too large')
  const monochrome = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate()
    .resize(portraitSize.width, portraitSize.height, { fit: 'cover' }).grayscale().normalise().png().toBuffer()
  const portrait = sharp(monochrome)
  if (design === 'afterimage') portrait.tint('#86c5b5')
  return `data:image/jpeg;base64,${(await portrait.jpeg({ quality: 88 }).toBuffer()).toString('base64')}`
}

export function ReportStoryDesign({ design, portrait, landmarks, score, potential }: {
  design: Exclude<StoryDesign, 'original'>; portrait: string; landmarks: FaceLandmarksPayload | null;
  score: string; potential: string;
}) {
  const precision = design === 'precision'
  const ink = precision ? '#171b1a' : '#f0f4ed'
  const muted = precision ? '#737a74' : '#a2c4b8'
  return <div style={{ width: 1080, height: 1920, display: 'flex', position: 'relative', background: precision ? '#f4f3ed' : '#061d18', color: ink }}>
    <div style={{ position: 'absolute', top: 192, left: 72, ...portraitSize, display: 'flex', overflow: 'hidden', background: precision ? '#d3d5ce' : '#0a372d' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={portrait} alt="" {...portraitSize} style={{ position: 'absolute', left: 0, top: 0, objectFit: 'cover' }} />
      {precision ? <>
        {[48, 78, 1456].map((top, index) => <div key={top} style={{ position: 'absolute', top, left: index === 1 ? 0 : 648, width: index === 1 ? 192 : 288, height: index === 1 ? 8 : 12, background: '#f4f3ed', display: 'flex' }} />)}
        <div style={{ position: 'absolute', top: 0, left: 0, ...portraitSize, display: 'flex', opacity: 0.65 }}><ShareOverallOverlay landmarks={landmarks} {...portraitSize} /></div>
      </> : <>
        {[0, 1, 2].map(index => <div key={index} style={{ position: 'absolute', left: 0, top: 0, width: 72 + index * 56, height: portraitSize.height, display: 'flex', overflow: 'hidden', opacity: 0.16 + index * 0.1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={portrait} alt="" {...portraitSize} style={{ position: 'absolute', left: -400 + index * 40, objectFit: 'cover' }} />
        </div>)}
        <ShareOverallOverlay landmarks={landmarks} {...portraitSize} />
      </>}
      <div style={{ position: 'absolute', top: 0, left: 0, ...portraitSize, display: 'flex', background: precision
        ? 'linear-gradient(180deg, rgba(244,243,237,0.84) 0%, rgba(244,243,237,0.72) 12%, rgba(244,243,237,0) 26%, rgba(244,243,237,0) 66%, rgba(244,243,237,0.72) 84%, rgba(244,243,237,0.94) 100%)'
        : 'linear-gradient(180deg, rgba(6,29,24,0.84) 0%, rgba(6,29,24,0.72) 12%, rgba(6,29,24,0.05) 29%, rgba(6,29,24,0.12) 62%, rgba(6,29,24,0.84) 85%, rgba(6,29,24,0.96) 100%)' }} />
    </div>
    <div style={{ position: 'absolute', top: 230, left: 72, right: 72, display: 'flex', justifyContent: 'space-between', fontSize: 30, letterSpacing: 2 }}>
      <span>MOGGING.COM</span><span style={{ color: muted }}>REPORT / {precision ? '02' : '06'}</span>
    </div>
    <div style={{ position: 'absolute', top: 292, left: 72, display: 'flex', fontSize: 84, letterSpacing: -4, lineHeight: 1 }}>
      {precision ? 'Face study.' : 'See your potential.'}
    </div>
    <div style={{ position: 'absolute', top: 1370, left: 72, right: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${precision ? '#bfc5bd' : '#34574c'}`, paddingTop: 24, fontSize: 24, letterSpacing: 2 }}>
      <span>FACIAL ANALYSIS</span><span style={{ color: muted }}>PERSONAL REPORT</span>
    </div>
    <div style={{ position: 'absolute', top: 1450, left: 72, right: 72, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ color: muted, fontSize: 23, letterSpacing: 2 }}>CURRENT SCORE</span><div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}><span style={{ fontSize: 132, letterSpacing: -7, lineHeight: 1.15 }}>{score}</span><span style={{ fontSize: 30, color: muted, marginBottom: 24 }}> / 10</span></div></div>
      <span style={{ color: muted, fontSize: 60, marginBottom: 26 }}>→</span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}><span style={{ color: muted, fontSize: 23, letterSpacing: 2 }}>POTENTIAL</span><span style={{ fontSize: 132, letterSpacing: -7, lineHeight: 1.15 }}>{potential}</span></div>
    </div>
  </div>
}
