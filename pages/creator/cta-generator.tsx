import { useMemo, useState } from 'react'
import { Check, Copy, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CreatorHeader, CreatorShell, Field, fieldClass } from '@/components/creator/creator-shell'

const templates = {
  conversion: [
    'Ready to {goal}? Try {offer} today.',
    'Your next step to {goal} starts with {offer}.',
    'Stop scrolling—{offer} is built to help you {goal}.',
    'I found a simpler way to {goal}: {offer}.',
    'If you want to {goal}, this is your sign to try {offer}.',
    'See what changes when you use {offer} for yourself.',
  ],
  engagement: [
    'Would you try {offer} to {goal}? Tell me below.',
    'Send this to someone who wants to {goal}.',
    'Save this for the next time you want to {goal}.',
    'Which part of {offer} would you test first?',
    'Comment “MOG” and I’ll share how I use {offer}.',
    'Follow for more honest ways to {goal}.',
  ],
  traffic: [
    'Tap the link in bio to see how {offer} helps you {goal}.',
    'Get the full breakdown of {offer} at the link in bio.',
    'Want to {goal}? Everything you need is in the link.',
    'I put {offer} to the test—see the result at the link in bio.',
    'Explore {offer} and start your path to {goal}.',
    'The next step is one tap away. Find {offer} in my bio.',
  ],
} as const

export default function CtaGeneratorPage() {
  const [goalType, setGoalType] = useState<keyof typeof templates>('conversion')
  const [goal, setGoal] = useState('upgrade your look')
  const [offer, setOffer] = useState('the Mogging app')
  const [platform, setPlatform] = useState('TikTok')
  const [seed, setSeed] = useState(0)
  const [copied, setCopied] = useState<number | null>(null)
  const results = useMemo(() => rotate(templates[goalType], seed).map((template) => adapt(template.replaceAll('{goal}', goal || 'reach your goal').replaceAll('{offer}', offer || 'Mogging'), platform)), [goalType, goal, offer, platform, seed])

  async function copy(text: string, index: number) {
    await navigator.clipboard.writeText(text)
    setCopied(index)
    toast.success('CTA copied')
    window.setTimeout(() => setCopied(null), 1500)
  }

  return (
    <CreatorShell>
      <CreatorHeader eyebrow="Creator tool" title="CTA Generator" description="Turn campaign context into concise calls to action, then copy the one that fits your voice." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section className="h-fit rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.05)] sm:p-7">
          <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-zinc-100"><Sparkles className="size-4" /></span><div><h2 className="font-semibold tracking-[-0.025em]">Campaign context</h2><p className="text-xs text-zinc-500">Keep it specific for stronger results.</p></div></div>
          <div className="mt-6 grid gap-5">
            <Field label="Primary goal"><select className={fieldClass} value={goalType} onChange={(event) => setGoalType(event.target.value as keyof typeof templates)}><option value="conversion">Drive conversions</option><option value="engagement">Build engagement</option><option value="traffic">Send traffic</option></select></Field>
            <Field label="Help viewers…"><input className={fieldClass} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="upgrade their look" /></Field>
            <Field label="Product or offer"><input className={fieldClass} value={offer} onChange={(event) => setOffer(event.target.value)} placeholder="the Mogging app" /></Field>
            <Field label="Platform"><select className={fieldClass} value={platform} onChange={(event) => setPlatform(event.target.value)}>{['TikTok', 'Instagram Reels', 'YouTube Shorts', 'YouTube'].map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Button className="h-11 rounded-xl" onClick={() => setSeed((value) => value + 1)}><RefreshCw />Generate a new mix</Button>
          </div>
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">Suggested CTAs</p><p className="text-xs text-zinc-400">Click to copy</p></div>
          <div className="grid gap-3">{results.map((result, index) => <button key={`${seed}-${index}`} onClick={() => void copy(result, index)} className="creator-list-item group flex min-h-20 items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-[0_8px_30px_rgba(15,23,42,0.035)] transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_14px_40px_rgba(15,23,42,0.07)] active:scale-[0.995]" style={{ animationDelay: `${index * 45}ms` }}><span className="flex-1 text-sm font-medium leading-6 tracking-[-0.01em]">{result}</span><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-500 transition-colors duration-150 group-hover:bg-black group-hover:text-white">{copied === index ? <Check className="size-4" /> : <Copy className="size-4" />}</span></button>)}</div>
        </section>
      </div>
    </CreatorShell>
  )
}

function rotate<T>(items: readonly T[], amount: number) { const offset = amount % items.length; return [...items.slice(offset), ...items.slice(0, offset)] }
function adapt(text: string, platform: string) { return platform === 'YouTube' ? text.replace('link in bio', 'link in the description') : text }
