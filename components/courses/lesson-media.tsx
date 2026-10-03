import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { FileText, Plus, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { BunnyPlayer } from './bunny-player'
import { courseRequest, creatorCoursePath, type CourseAsset, CourseRequestError } from '@/lib/courses/client'
import type { CourseLesson } from '@/lib/courses/validation'
import { uploadCourseFile } from '@/lib/courses/upload'

export function LessonMedia({ courseId, lesson, assets, patch, flush, changed, preview = false, kind }: {
  courseId: string; lesson: CourseLesson; assets: CourseAsset[]; kind: 'video' | 'resource'; preview?: boolean
  patch: (patch: Partial<CourseLesson>) => void; flush: () => Promise<number>; changed: () => Promise<unknown>
}) {
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const pending = useRef<AbortController | null>(null)
  const resumeId = useRef<string | undefined>(undefined)
  const current = useRef(lesson)
  current.current = lesson
  const video = assets.find(asset => asset.id === lesson.videoAssetId)
  const resources = assets.filter(asset => lesson.resourceAssetIds.includes(asset.id))
  const playbackPath = video?.state === 'ready' && kind === 'video' ? `/api/courses/${courseId}/lessons/${lesson.id}/assets/${video.id}?draft=true` : null
  const playback = useSWR<{ url: string }>(playbackPath, courseRequest, { refreshInterval: 12 * 60_000, revalidateOnFocus: false })
  useEffect(() => () => pending.current?.abort(), [])
  const upload = async (files: File[]) => {
    if (pending.current || !files.length) return
    const resumeAssetId = resumeId.current; resumeId.current = undefined
    if (!resumeAssetId && kind === 'resource' && current.current.resourceAssetIds.length + files.length > 10) return toast.error('Add up to 10 attachments per lesson.')
    const controller = new AbortController(); pending.current = controller
    setProgress(0)
    try {
      await flush()
      for (const file of kind === 'video' ? files.slice(0, 1) : files) {
        await uploadCourseFile(courseId, file, kind, {
          signal: controller.signal, progress: setProgress, resumeAssetId,
          reserved: async id => {
            patch(kind === 'video' ? { videoAssetId: id } : { resourceAssetIds: [...current.current.resourceAssetIds, id] })
            await flush(); await changed()
          },
        })
        await changed()
      }
      toast.success(kind === 'video' ? 'Video uploaded. Bunny is processing it.' : 'Attachments uploaded.')
    } catch (error) {
      if (!controller.signal.aborted) toast.error((error as Error).message)
    } finally { pending.current = null; setProgress(null); if (!controller.signal.aborted) await changed().catch(() => {}) }
  }
  const download = async (asset: CourseAsset) => {
    try {
      await flush()
      const result = await courseRequest<{ url: string }>(`/api/courses/${courseId}/lessons/${lesson.id}/assets/${asset.id}?draft=true`)
      window.location.assign(result.url)
    } catch (error) { toast.error((error as Error).message) }
  }
  const remove = async (asset: CourseAsset) => {
    patch(kind === 'video' ? { videoAssetId: null } : { resourceAssetIds: current.current.resourceAssetIds.filter(id => id !== asset.id) })
    try {
      await flush()
      // Published lessons may still use the asset. The backend protects those references.
      await courseRequest(`${creatorCoursePath(courseId)}/assets/${asset.id}`, 'DELETE')
      await changed()
    } catch (error) { if (error instanceof CourseRequestError && error.status === 409) { toast.info('Removed from this draft. The published course still uses this file.'); await changed().catch(() => {}) } else toast.error((error as Error).message) }
  }
  const retry = (id: string) => { resumeId.current = id; if (input.current) input.current.multiple = false; input.current?.click() }
  const choose = () => { resumeId.current = undefined; if (input.current) input.current.multiple = kind === 'resource'; input.current?.click() }
  return <>
    {kind === 'video' ? <>
      {playback.data ? <BunnyPlayer url={playback.data.url} title={lesson.title} /> : video ? <div className="c-video-dropzone" role="status"><h2>{video.state === 'ready' ? 'Loading video…' : video.state === 'failed' ? 'Video processing failed' : video.state === 'pending' ? 'Upload incomplete' : 'Video is processing'}</h2><p>{video.title}</p></div> : <button className="c-video-dropzone" disabled={progress !== null || preview} onClick={choose} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!preview) void upload(Array.from(event.dataTransfer.files)) }}><span className="c-upload-symbol"><Upload size={25} strokeWidth={1.4} /></span><h2>Upload lesson video</h2><p>Drop a video here, or choose a file.</p><span className="c-button c-button-dark">Upload video <Plus size={15} /></span><small>MP4, MOV, or WebM · up to 2 hours</small></button>}
      {playback.error && <p role="alert">{playback.error.message}</p>}
      {video && !preview && <div className="c-media-actions">{video.state === 'pending' && <button className="c-text-link" disabled={progress !== null} onClick={() => retry(video.id)}>Resume upload</button>}<button className="c-text-link" disabled={progress !== null} onClick={choose}>Replace video</button><button className="c-text-link" disabled={progress !== null} onClick={() => void remove(video)}>Remove video</button></div>}
    </> : <>
      {!preview && <button className="c-text-link" disabled={progress !== null} onClick={choose}><Plus size={15} />Add attachment</button>}
      {!!resources.length && <ul className="c-attachments">{resources.map(asset => <li key={asset.id}><FileText size={16} /><button className="c-text-link" disabled={asset.state !== 'ready'} onClick={() => void download(asset)}>{asset.title}{asset.state !== 'ready' ? ` · ${asset.state}` : ''}</button>{!preview && asset.state === 'pending' && <button className="c-text-link" disabled={progress !== null} onClick={() => retry(asset.id)}>Resume</button>}{!preview && <button className="c-small-icon" disabled={progress !== null} aria-label={`Remove ${asset.title}`} onClick={() => void remove(asset)}><X size={14} /></button>}</li>)}</ul>}
    </>}
    {progress !== null && <div className="c-upload-progress" role="status"><progress value={progress} max={100} aria-label="File upload" /><span>{progress === 100 ? 'Processing…' : `Uploading ${progress}%`}</span><button className="c-text-link" onClick={() => pending.current?.abort()}>Cancel</button></div>}
    <input ref={input} className="c-hidden-input" type="file" multiple={kind === 'resource'} accept={kind === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'application/pdf,text/plain,image/png,image/jpeg'} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void upload(files) }} />
  </>
}
