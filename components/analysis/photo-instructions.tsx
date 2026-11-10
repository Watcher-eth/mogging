import { Info, MoveHorizontal, MoveVertical } from '@/components/ui/mogging-glyphs'
import { motion, useReducedMotion } from 'motion/react'
import { useId, useState } from 'react'
import { TextMorph } from 'torph/react'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { StudioGuide } from './studio-guide'

const lessons = [
  { tab: 'Distance', title: 'Step back from the camera.', text: 'Use the rear camera where possible. A photo taken too close can exaggerate the features nearest the lens.' },
  { tab: 'Height', title: 'Bring the camera to eye level.', text: 'Keep your head level and the camera straight. Use even light so both sides of your face are visible.' },
  { tab: 'Side profile', title: 'Turn fully to the side.', text: 'Look straight ahead and keep the forehead, nose, chin, and ear in frame.' },
] as const

export function PhotoInstructions() {
  const [index, setIndex] = useState(0)
  const [distance, setDistance] = useState(65)
  const [height, setHeight] = useState(50)
  const labelId = useId()
  const reduce = useReducedMotion()
  const lesson = lessons[index]
  const adjustingDistance = index === 0
  const cameraX = adjustingDistance ? 118 + distance * 1.6 : 254
  const cameraY = adjustingDistance ? 52 : 18 + height * .68

  return (
    <Dialog>
      <DialogTrigger asChild><button type="button" className="assessment-secondary"><Info size={15} /> Photo tips</button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-[28px] p-6 sm:p-8">
        <DialogTitle className="text-2xl tracking-tight">A clearer starting point</DialogTitle>
        <DialogDescription>Three ways to get a more useful reference photo.</DialogDescription>
        <div className="assessment-view-switch" role="group" aria-label="Photo tips topics">
          {lessons.map((item, itemIndex) => <button key={item.tab} type="button" aria-pressed={index === itemIndex} onClick={() => setIndex(itemIndex)}>{item.tab}</button>)}
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold tracking-tight"><TextMorph>{lesson.title}</TextMorph></h3>
          <p className="text-sm leading-relaxed text-zinc-600">{lesson.text}</p>
        </div>
        {index === 2 ? <div className="mx-auto w-full max-w-64 overflow-hidden rounded-2xl"><StudioGuide kind="side" /></div> : (
          <div className="grid gap-3 rounded-2xl bg-zinc-100 p-4">
            <svg viewBox="0 0 340 132" className="mx-auto w-full max-w-80 text-zinc-700" fill="none" aria-hidden="true">
              <path d="M41 98c-6-14-3-23 2-29l-9-5 10-13c0-21 10-33 29-33 22 0 34 15 34 35 0 17-8 23-12 35l2 23M42 45h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M45 53H298M46 110H298" stroke="#a1a1aa" strokeWidth="1" strokeDasharray="4 5" />
              <path d={`M48 33L${cameraX} ${cameraY}L48 83Z`} fill="#365e7c" fillOpacity=".08" stroke="#365e7c" strokeOpacity=".25" />
              <path d={`M48 52L${cameraX} ${cameraY}`} stroke="#365e7c" strokeWidth="2" />
              <motion.g initial={false} animate={{ x: cameraX, y: cameraY - 52 }} transition={{ duration: reduce ? 0 : .08 }}>
                <rect x="-9" y="34" width="22" height="38" rx="5" fill="#f4f4f5" stroke="currentColor" strokeWidth="2" />
                <circle cx="-3" cy="42" r="2" fill="currentColor" />
              </motion.g>
              <path d="M112 110h170" stroke="#a1a1aa" />
              {Array.from({ length: 18 }, (_, tick) => <path key={tick} d={`M${112 + tick * 10} 110v${tick % 5 === 0 ? 10 : 5}`} stroke="#71717a" />)}
            </svg>
            <div className="grid gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-700" htmlFor={labelId}>
                {adjustingDistance ? <MoveHorizontal size={15} aria-hidden="true" /> : <MoveVertical size={15} aria-hidden="true" />}
                {adjustingDistance ? 'Move the camera' : 'Adjust camera height'}
              </label>
              <input id={labelId} className="accent-zinc-800" type="range" min="0" max="100" value={adjustingDistance ? distance : height} onChange={event => (adjustingDistance ? setDistance : setHeight)(Number(event.target.value))} />
              <div className="flex justify-between text-[11px] text-zinc-600"><span>{adjustingDistance ? 'Close up' : 'Above eye level'}</span><span>{adjustingDistance ? 'Farther back' : 'Below eye level'}</span></div>
            </div>
          </div>
        )}
        {index === 1 && <div className="mx-auto w-full max-w-60 overflow-hidden rounded-2xl"><StudioGuide kind="distance" /></div>}
      </DialogContent>
    </Dialog>
  )
}
