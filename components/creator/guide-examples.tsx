import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { negativeExamples, positiveExamples } from '@/lib/creator/guide-examples'
import imageSizes from '@/lib/creator/guide-image-sizes.json'
import { cn } from '@/lib/utils'

const sourceDocs = {
  acceptable: 'https://docs.google.com/document/d/1UFz4KZ21VmjEl69jdbZC1q3_5evthK3EnLCt93dp6h8/edit',
  'not-acceptable': 'https://docs.google.com/document/d/1jKZYY0dxwsDBVyHmdXQ2oKnBLbTfV3wbMmapx6uuUew/edit',
}
type Classification = keyof typeof sourceDocs

export default function GuideExamples() {
  const [classification, setClassification] = useState<Classification>('acceptable')
  const examples = classification === 'acceptable' ? positiveExamples : negativeExamples

  return (
    <section id="guide-panel-examples" aria-label="Examples and references" className="overflow-hidden">
      <header className="border-b border-[#eceef0] pb-6">
        <p className="text-xs font-semibold text-[#00A8EF]">Learn from the references</p>
        <h1 className="mt-1 text-[28px] font-medium leading-tight tracking-[-0.04em] sm:text-[32px]">Examples & references</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#73777d]">Read the hook, look at the footage, then look at the comments. The supplied examples show how those choices attract different audiences. Expand one example at a time for its screenshot, explanation, and a Mogging takeaway.</p>
        <details className="mt-3 text-xs text-[#73777d]"><summary className="cursor-pointer py-2 font-medium">How to use these references</summary><p className="mt-2 max-w-3xl leading-5">These are historical content-relevance references, not blanket approval for Mogging or permission to repost someone else’s work. All current requirements still apply: original content, clear product footage, CTA, account verification, and eligible analytics. Explanations and suggested rewrites below are Mogging guidance.</p></details>
        <div className="mt-5 flex flex-wrap gap-2" aria-label="Example classification">
          {(['acceptable', 'not-acceptable'] as const).map((value) => <button key={value} type="button" aria-pressed={classification === value} onClick={() => setClassification(value)} className={cn('min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors', classification === value ? 'creator-choice-selected' : 'border-black/10 bg-white text-[#73777d] hover:bg-[#f7f8f9]')}>{value === 'acceptable' ? 'What we want' : 'What we don’t want'}</button>)}
        </div>
      </header>
      <div className="py-6" key={classification}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{examples.length} explained examples</h3><a href={sourceDocs[classification]} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[#00A8EF]">Historical reference document<ExternalLink className="size-3.5" /></a></div>
        <div className="grid gap-2">
          {examples.map((example, index) => <details key={example.id} name="creator-reference-example" className="overflow-hidden rounded-2xl border border-black/[0.07]" id={example.id}>
            <summary className="cursor-pointer px-4 py-4 text-sm font-semibold"><span className="mr-3 text-xs tabular-nums text-[#858a91]">{String(index + 1).padStart(2, '0')}</span>{example.title}</summary>
            <div className="border-t border-black/[0.055] p-4 sm:p-5">
              {example.hook ? <p className="creator-notice mb-4 rounded-xl p-4 text-sm font-medium leading-6">Source hook: “{example.hook}”</p> : null}
              {example.posts ? <div className="mb-4 grid gap-2">{example.posts.map(post => <a key={post.url} href={post.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#00A8EF]">{post.label}<ExternalLink className="size-3.5 shrink-0" /></a>)}</div> : null}
              {example.images.length ? <div className={cn('grid gap-3', example.images.length > 1 && 'sm:grid-cols-2')}>{example.images.map((id) => {
                const [width, height] = imageSizes[id as keyof typeof imageSizes]
                return <figure key={id}><a href={`/creator-guide/${id}.webp`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-[#f7f8f9]" aria-label={`Open full-size source screenshot: ${example.title}`}><Image src={`/creator-guide/${id}.webp`} width={width} height={height} sizes="(max-width: 768px) 100vw, 900px" alt={`${example.title}: source video still${example.images.length === 1 ? ' and audience comments' : ''}`} className="h-auto max-h-[600px] w-full object-contain" /></a><figcaption className="mt-2 text-xs text-[#858a91]">Source screenshot · Open image to inspect the text</figcaption></figure>
              })}</div> : null}
              <div className="mt-5 grid gap-4 md:grid-cols-2"><div><h4 className="text-xs font-semibold uppercase tracking-wide text-[#858a91]">{classification === 'acceptable' ? 'Why it fits the reference' : 'Why it misses the brief'}</h4><p className="mt-2 text-sm leading-6 text-[#73777d]">{example.explanation}</p></div><div><h4 className="text-xs font-semibold uppercase tracking-wide text-[#858a91]">Apply this to Mogging</h4><p className="mt-2 text-sm leading-6 text-[#73777d]">{example.takeaway}</p></div></div>
              {example.mockReport ? <Link href="/creator/cta-generator" className="creator-notice mt-5 flex min-h-11 items-center justify-between gap-3 rounded-xl p-4"><span><span className="block text-sm font-semibold">Create this format with the mock report generator</span><span className="mt-1 block text-xs leading-5 text-[#73777d]">Choose Mock reports in CTA Studio to build evaluation visuals.</span></span><ExternalLink className="size-4 shrink-0 text-[#00A8EF]" /></Link> : null}
            </div>
          </details>)}
        </div>
      </div>
    </section>
  )
}
