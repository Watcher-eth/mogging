import { useEffect, useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'motion/react'
import { drawVideoFrame, type PreparedVideo } from '@/lib/creator/video-renderer'
import type { VideoScene } from '@/lib/creator/video-composition'
import { appearanceVariants, motionEase, motionTiming } from '@/lib/creator/motion-presets'

export function VideoStoryboard({ prepared, selectedId, onSelect }: { prepared: PreparedVideo; selectedId: string; onSelect: (id: string) => void }) {
  return <div className="mt-4 grid gap-4"><p className="text-xs leading-5 text-zinc-500">Review the settled frame of every shot before exporting. These are drawn live from the same composition, not downloaded videos. Select a shot to inspect it.</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{prepared.composition.scenes.map((scene, index) => <ScenePreview key={scene.id} prepared={prepared} scene={scene} index={index} selected={selectedId === scene.id} onSelect={onSelect} />)}</div></div>
}

function ScenePreview({ prepared, scene, index, selected, onSelect }: { prepared: PreparedVideo; scene: VideoScene; index: number; selected: boolean; onSelect: (id: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null), buttonRef = useRef<HTMLButtonElement>(null)
  const visible = useInView(buttonRef, { once: true, margin: '100px' }), reduced = useReducedMotion()
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (visible && ctx) drawVideoFrame(ctx, prepared, scene.startMs + scene.durationMs - 1, 360, 640)
  }, [visible, prepared, scene])
  return <motion.button ref={buttonRef} type="button" aria-label={`Preview shot ${index + 1}: ${scene.label}`} aria-pressed={selected} onClick={() => onSelect(scene.id)} className={`min-w-0 rounded-xl border p-2 text-left ${selected ? 'border-sky-400 bg-sky-50' : 'border-zinc-200 bg-white'}`} initial={reduced ? false : 'hidden'} animate={visible || reduced ? 'visible' : 'hidden'} variants={appearanceVariants('group-reveal')} transition={{ duration: reduced ? 0 : motionTiming.enter, ease: motionEase }}><canvas ref={canvasRef} width={360} height={640} className="aspect-[9/16] w-full rounded-md bg-zinc-50" role="img" aria-label={`Settled frame of ${scene.label}`} /><span className="mt-2 block text-[10px] font-semibold">{index + 1} · {(scene.startMs / 1000).toFixed(1)}s</span><span className="block truncate text-[10px] text-zinc-500">{scene.label}</span></motion.button>
}
