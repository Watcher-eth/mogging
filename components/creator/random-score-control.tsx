import { useId, useState } from 'react'
import { Shuffle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldClass } from './creator-shell'
import { scoreRanges, type ScoreRange } from '@/lib/creator/random-scores'

export function RandomScoreControl({ onRandomize }: { onRandomize: (range: ScoreRange) => void }) {
  const [range, setRange] = useState<ScoreRange>('medium-high')
  const id = useId()
  return <div className="flex flex-wrap items-end gap-3">
    <div className="min-w-44 flex-1"><label htmlFor={id} className="mb-2 block text-sm font-medium">Random value range</label><select id={id} className={fieldClass} value={range} onChange={event => setRange(event.target.value as ScoreRange)}>{Object.entries(scoreRanges).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></div>
    <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => onRandomize(range)}><Shuffle />Randomize values</Button>
  </div>
}
