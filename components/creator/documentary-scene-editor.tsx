import { useState } from 'react'
import type { GeneratorImage } from '@/lib/creator/content-generator'
import { parseComposition, type VideoComposition, type VideoScene } from '@/lib/creator/video-composition'
import { VideoThumbnail } from './video-thumbnail'
import type { PreparedVideo } from '@/lib/creator/video-renderer'
import styles from './video-studio.module.css'

type Props = { composition: VideoComposition; prepared: PreparedVideo | null; images: GeneratorImage[]; onChange(composition: VideoComposition): void; onSeek(time: number): void }
const treatments = { stage: 'Portrait stage', inspection: 'Feature inspection', comparison: 'Before / after', anatomy: '3D anatomy study', relations: 'Feature relationships', media: 'Context footage', conclusion: 'Closing invitation' } as const

export function DocumentarySceneEditor({ composition, prepared, images, onChange, onSeek }: Props) {
  const [selectedId, setSelectedId] = useState(composition.scenes[0].id)
  const scene = composition.scenes.find(scene => scene.id === selectedId) ?? composition.scenes[0]
  const kind = scene.documentary?.kind ?? 'stage'
  const footage = composition.media?.filter(asset => asset.kind === 'video' && asset.source.usage !== 'review' && asset.scope.kind === 'public') ?? []
  function update(value: Partial<VideoScene>) {
    onChange(parseComposition({ ...composition, scenes: composition.scenes.map(item => item.id === scene.id ? { ...item, ...value } : item) }))
  }
  return <div className="grid gap-5">
    <div className="flex gap-3 overflow-x-auto pb-2" role="group" aria-label="Documentary scenes">
      {composition.scenes.map((item, index) => <button key={item.id} type="button" className={styles.clip} data-selected={scene.id === item.id} aria-pressed={scene.id === item.id} onClick={() => { setSelectedId(item.id); onSeek(item.startMs + Math.min(1200, item.durationMs / 2)) }}>
        <span className={styles.clipFrame}><VideoThumbnail prepared={prepared} scene={item} /></span>
        <span className={styles.clipDuration}>{String(index + 1).padStart(2, '0')} · {(item.durationMs / 1000).toFixed(1)}s</span>
        <strong>{treatments[item.documentary?.kind ?? 'stage']}</strong>
      </button>)}
    </div>
    <label className="grid gap-2 text-xs">Scene treatment<select className="rounded-xl border border-zinc-200 bg-transparent p-3 text-sm" value={kind} onChange={event => {
      const next = event.target.value as keyof typeof treatments
      update({ documentary: { kind: next, label: scene.documentary?.label ?? scene.label, ...(next === 'media' ? { mediaId: footage[0]?.id } : {}) } })
    }}>
      {Object.entries(treatments).map(([value, label]) => <option key={value} value={value} disabled={value === 'comparison' && !scene.source.secondaryImageId || value === 'media' && !footage.length}>{label}</option>)}
    </select></label>
    {kind === 'media' ? <label className="grid gap-2 text-xs">Footage<select className="rounded-xl border border-zinc-200 bg-transparent p-3 text-sm" value={scene.documentary?.mediaId ?? ''} onChange={event => update({ documentary: { kind, label: scene.label, mediaId: event.target.value } })}>
      {footage.map(asset => <option key={asset.id} value={asset.id}>{asset.source.author || asset.id}</option>)}
    </select></label> : !['comparison', 'anatomy'].includes(kind) ? <label className="grid gap-2 text-xs">Photograph<select className="rounded-xl border border-zinc-200 bg-transparent p-3 text-sm" value={scene.source.imageId ?? ''} disabled={Boolean(scene.scoreCallouts?.length)} onChange={event => update({ source: { ...scene.source, imageId: event.target.value } })}>
      {images.map(image => <option key={image.id} value={image.id}>{image.name}</option>)}
    </select>{scene.scoreCallouts?.length ? <span className="text-zinc-500">Spoken scores stay with their assessed portrait.</span> : null}</label> : null}
    <p className="text-xs leading-6 text-zinc-500">{scene.narration}</p>
  </div>
}
