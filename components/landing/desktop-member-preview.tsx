import sampleLandmarks from '@/components/analysis/intro-portrait.json'
import type { SkinPortrait } from '@/components/analysis/progress-skin-portrait'
import { useState } from 'react'
import ProtocolPage from '@/components/members/protocol'
import ProgressPage from '@/components/members/progress'
import { deriveProtocolProfile, protocolTasks } from '@/lib/creator/protocol-tasks'

const samples = [
  { overall: 7.1, symmetry: 7, face: 7, proportions: 7.2, eyes: 7.9, brows: 7.4, nose: 7.2, mouth: 7, jaw: 7.3, cheeks: 7.5, skin: 7.7, hair: 7.4, ears: 7.2 },
  { overall: 6.8, symmetry: 6.8, face: 7.1, proportions: 7, eyes: 7.7, brows: 7.2, nose: 7.2, mouth: 6.9, jaw: 6.7, cheeks: 7.1, skin: 6.9, hair: 7.3, ears: 7.1 },
  { overall: 6.5, symmetry: 6.3, face: 6.9, proportions: 7.2, eyes: 7.5, brows: 6.9, nose: 7, mouth: 6.7, jaw: 6.8, cheeks: 7.2, skin: 6.6, hair: 7.1, ears: 7 },
  { overall: 6.3, symmetry: 6.1, face: 6.8, proportions: 6.9, eyes: 7.1, brows: 6.8, nose: 7.1, mouth: 6.6, jaw: 6.5, cheeks: 7, skin: 6.2, hair: 7.1, ears: 7.1 },
]
const profile = deriveProtocolProfile({ report: {
  categories: Object.entries(samples[0]).map(([id, score]) => ({ id, score })),
  protocolContext: { faceShape: 'oval', visibleConcerns: ['dryness'] },
} })

const protocolPreviewSlots = [
  [12, protocolTasks.find(task => task.key === 'brow-set')],
  [13],
  [14],
  [15],
  [16, protocolTasks.find(task => task.key === 'skin-touch-habit')],
] as const

export function DesktopMemberPreview({ view, now, compact = false, mobile = false, onNewScan }: { view: 'protocol' | 'progress'; now?: number; compact?: boolean; mobile?: boolean; onNewScan?: () => void }) {
  const [date] = useState(() => now ?? Date.now())
  const evaluations = samples.map((scores, index) => ({
    id: `sample-${index}`, date: new Date(date - [2, 10, 24, 56][index] * 86_400_000).toISOString(), scores, potential: 8.3,
  }))
  if (view === 'protocol' && compact) {
    return <ol aria-label="Sample Protocol timeline" className="flex h-full flex-col justify-center border-b border-zinc-100">
      {protocolPreviewSlots.map(([hour, task]) => <li key={hour} className="grid min-h-8 grid-cols-[3rem_minmax(0,1fr)] items-start gap-2 border-t border-zinc-100 py-2 sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-4">
        <time dateTime={`${hour}:00`} className="pt-0.5 text-xs font-medium tabular-nums text-zinc-500">{hour}:00</time>
        {task && <span className="flex min-h-12 items-center rounded-2xl border-l-[3px] px-3 text-sm font-semibold" style={{ backgroundColor: `${task.color}14`, borderColor: task.color }}>{task.title}</span>}
      </li>)}
    </ol>
  }
  return view === 'protocol' 
    ? <ProtocolPage userId="desktop-preview" profile={profile} gender="other" hasEvaluation preview mobile={mobile} />
    : <ProgressPage gridOnly={compact} mobile={mobile} onNewScan={onNewScan} evaluations={evaluations} focusIds={['skin', 'jaw']} skinPortrait={{ src: '/model.png', landmarks: sampleLandmarks as SkinPortrait['landmarks'] }} preview />
}
