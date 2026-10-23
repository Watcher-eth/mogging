import { useEffect, useState } from 'react'
import { Check, FileVideo } from 'lucide-react'

export function AnalyticsRecordingPreview({ file, onChoose }: { file: File; onChoose: () => void }) {
  const [source, setSource] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSource(url)
    setFailed(false)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const size = file.size < 1024 * 1024 ? `${Math.ceil(file.size / 1024)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`
  return <button type="button" onClick={onChoose} aria-label={`Change analytics recording: ${file.name}`} className="flex w-full items-center gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-3 text-left sm:gap-4">
    <span aria-hidden="true" className="relative grid h-20 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-zinc-200 text-zinc-400">
      <FileVideo className="size-5" />
      {source && !failed ? <video src={source} muted playsInline preload="metadata" onLoadedMetadata={event => { const video = event.currentTarget; if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(0.1, video.duration / 2) }} onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" /> : null}
    </span>
    <span className="min-w-0 flex-1"><span title={file.name} className="line-clamp-2 break-words text-sm font-medium leading-5 text-zinc-800">{file.name}</span><span className="mt-1 block text-xs tabular-nums text-zinc-500">{size}</span></span>
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700"><Check aria-hidden="true" className="size-3" />Uploaded</span>
  </button>
}
