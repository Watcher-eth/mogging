export function getFaceStudyRenderOrigin() {
  const configured = process.env.FACE_STUDY_RENDER_ORIGIN?.trim()
  const deployment = process.env.VERCEL_URL && process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()
    ? `https://${process.env.VERCEL_URL}`
    : undefined
  const local = process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : undefined
  try {
    const url = new URL(configured || deployment || local || '')
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return undefined
    if (url.protocol === 'https:' || (local && url.protocol === 'http:')) return url.origin
  } catch {
    return undefined
  }
}
