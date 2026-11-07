import { drawVideoFrame, type PreparedVideo } from './video-renderer'

// The serverless Chromium build can encode VP8 without proprietary codecs.
// IVF carries the encoded frames to FFmpeg, which creates the delivery MP4.
export async function encodeStudyFrames(prepared: PreparedVideo) {
  const width = 540, height = 960, frameRate = 24
  const count = Math.ceil(prepared.composition.durationMs * frameRate / 1000)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })!
  const header = new ArrayBuffer(32)
  const view = new DataView(header)
  new Uint8Array(header).set(new TextEncoder().encode('DKIF'))
  view.setUint16(6, 32, true)
  new Uint8Array(header).set(new TextEncoder().encode('VP80'), 8)
  view.setUint16(12, width, true)
  view.setUint16(14, height, true)
  view.setUint32(16, frameRate, true)
  view.setUint32(20, 1, true)
  view.setUint32(24, count, true)
  const parts: BlobPart[] = [header]
  let error: DOMException | undefined
  const encoder = new VideoEncoder({
    error: failure => { error = failure },
    output: chunk => {
      const packet = new ArrayBuffer(12 + chunk.byteLength)
      const metadata = new DataView(packet)
      metadata.setUint32(0, chunk.byteLength, true)
      metadata.setUint32(4, Math.round(chunk.timestamp * frameRate / 1_000_000), true)
      chunk.copyTo(new Uint8Array(packet, 12))
      parts.push(packet)
    },
  })
  try {
    encoder.configure({ codec: 'vp8', width, height, framerate: frameRate, bitrate: 900_000, latencyMode: 'realtime' })
    for (let index = 0; index < count; index++) {
      if (error) throw error
      drawVideoFrame(ctx, prepared, index * 1000 / frameRate, width, height)
      const frame = new VideoFrame(canvas, { timestamp: Math.round(index * 1_000_000 / frameRate) })
      try {
        encoder.encode(frame, { keyFrame: index % (frameRate * 2) === 0 })
      } finally {
        frame.close()
      }
      if (encoder.encodeQueueSize >= 8) await encoder.flush()
    }
    await encoder.flush()
    if (error) throw error
    if (parts.length !== count + 1) throw new Error('Portrait frame encoding was incomplete.')
    return new Blob(parts)
  } finally {
    if (encoder.state !== 'closed') encoder.close()
  }
}
