import Image from 'next/image'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { adjustFaceAlignment } from '@/lib/creator/adjust-face-alignment'

type AnchorKey = keyof FaceLandmarksPayload['anchors']

export function FaceAlignmentEditor({ src, landmarks, onChange }: {
  src: string
  landmarks: FaceLandmarksPayload
  onChange: (landmarks: FaceLandmarksPayload) => void
}) {
  const original = useRef(landmarks)
  const [draft, setDraft] = useState(landmarks)
  const [selected, setSelected] = useState<AnchorKey | null>(null)
  const pending = useRef(landmarks)
  const frame = useRef<number | null>(null)
  const drag = useRef<{ id: number; key: AnchorKey; face: FaceLandmarksPayload; rect: DOMRect; x: number; y: number } | null>(null)
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current) }, [])

  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current
    if (!active || active.id !== event.pointerId) return
    const origin = active.face.anchors[active.key]!
    pending.current = adjustFaceAlignment(active.face, active.key, {
      x: origin.x + (event.clientX - active.x) / active.rect.width,
      y: origin.y + (event.clientY - active.y) / active.rect.height,
    })
    if (frame.current === null) frame.current = requestAnimationFrame(() => {
      frame.current = null
      setDraft(pending.current)
    })
  }

  function finish(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const active = drag.current
    if (!active || active.id !== event.pointerId) return
    if (!cancelled) move(event)
    const next = cancelled ? active.face : pending.current
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    drag.current = null
    pending.current = next
    setDraft(next)
    onChange(next)
  }

  return <div>
    <p className="mb-3 text-xs leading-5 text-zinc-600">Drag the points to match your face. Use touch or arrow keys to fine-tune.</p>
    <div className="relative isolate mx-auto w-full max-w-lg select-none" style={{ aspectRatio: `${draft.image.width} / ${draft.image.height}` }}>
      <Image src={src} alt="Adjust face alignment" fill sizes="(max-width: 640px) 90vw, 512px" unoptimized draggable={false} className="rounded-xl object-contain" />
      <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        {Object.entries(draft.contours ?? {}).map(([key, points]) => <polyline key={key} points={points?.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="white" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
      </svg>
      {Object.entries(draft.anchors).map(([name, point]) => {
        if (!point) return null
        const key = name as AnchorKey
        return <button key={key} type="button" aria-label={`Move ${name.replace(/([A-Z])/g, ' $1').toLowerCase()}`}
          className="absolute z-10 grid size-6 -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab place-items-center rounded-full focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white active:cursor-grabbing"
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, zIndex: selected === key ? 20 : undefined }}
          onPointerDown={event => {
            if (!event.isPrimary || event.button !== 0 || drag.current) return
            event.preventDefault()
            event.currentTarget.focus({ preventScroll: true })
            event.currentTarget.setPointerCapture(event.pointerId)
            setSelected(key)
            drag.current = { id: event.pointerId, key, face: draft, rect: event.currentTarget.parentElement!.getBoundingClientRect(), x: event.clientX, y: event.clientY }
            pending.current = draft
          }}
          onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}
          onLostPointerCapture={event => finish(event, true)}
          onKeyDown={event => {
            const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
            if (!direction) return
            event.preventDefault()
            const amount = event.shiftKey ? 0.01 : 0.002
            const next = adjustFaceAlignment(draft, key, { x: point.x + direction[0] * amount, y: point.y + direction[1] * amount })
            setSelected(key)
            setDraft(next)
            onChange(next)
          }}>
          <span className={`pointer-events-none size-2.5 rounded-full border border-zinc-950 shadow-sm ${selected === key ? 'bg-white ring-2 ring-blue-500' : 'bg-cyan-300'}`} />
        </button>
      })}
    </div>
    <div className="mt-3 flex items-center justify-between gap-3 text-xs">
      <span className="text-zinc-500" role="status">{selected ? selected.replace(/([A-Z])/g, ' $1') : 'Select a point to adjust'}</span>
      <button type="button" className="min-h-11 shrink-0 font-medium text-[#0071e3]" onClick={() => { setDraft(original.current); onChange(original.current); setSelected(null) }}>Reset alignment</button>
    </div>
  </div>
}
