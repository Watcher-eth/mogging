import Image from 'next/image'
import { useState } from 'react'
import { ExternalLink, Search } from 'lucide-react'
import { negativeExamples, positiveExamples } from '@/lib/creator/guide-examples'
import imageSizes from '@/lib/creator/guide-image-sizes.json'
import references from '@/lib/creator/june-video-references.json'
import { cn } from '@/lib/utils'

const sourceDocs = {
  acceptable: 'https://docs.google.com/document/d/1UFz4KZ21VmjEl69jdbZC1q3_5evthK3EnLCt93dp6h8/edit',
  'not-acceptable': 'https://docs.google.com/document/d/1jKZYY0dxwsDBVyHmdXQ2oKnBLbTfV3wbMmapx6uuUew/edit',
}
type Classification = keyof typeof sourceDocs
const pageSize = 12

export default function GuideExamples() {
  const [classification, setClassification] = useState<Classification>('acceptable')
  const examples = classification === 'acceptable' ? positiveExamples : negativeExamples

  return (
    <section id="guide-panel-examples" role="tabpanel" aria-labelledby="guide-tab-examples" className="creator-surface overflow-hidden">
      <header className="border-b border-black/[0.055] p-5 sm:p-6">
        <p className="text-xs font-semibold text-[#0071e3]">Learn from the references</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">What we want. What we don’t.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#6e6e73]">Read the hook, look at the footage, then look at the comments. The supplied examples show how those choices attract different audiences. Expand one example at a time for its screenshot, explanation, and a Mogging takeaway.</p>
        <p className="mt-3 max-w-3xl text-xs leading-5 text-[#6e6e73]">These are historical content-relevance references, not blanket approval for Mogging or permission to repost someone else’s work. All current requirements still apply: original content, clear product footage, CTA, account verification, and eligible analytics. Explanations and suggested rewrites below are Mogging guidance.</p>
        <div className="mt-5 flex flex-wrap gap-2" aria-label="Example classification">
          {(['acceptable', 'not-acceptable'] as const).map((value) => <button key={value} type="button" aria-pressed={classification === value} onClick={() => setClassification(value)} className={cn('min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors', classification === value ? 'border-[#1d1d1f] bg-[#1d1d1f] text-white' : 'border-black/10 bg-white text-[#6e6e73] hover:bg-[#f5f5f7]')}>{value === 'acceptable' ? 'What we want' : 'What we don’t want'}</button>)}
        </div>
        <a href="#june-index-title" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#0071e3] underline underline-offset-4">Browse the June video index ↓</a>
      </header>
      <div className="p-5 sm:p-6" key={classification}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{examples.length} explained examples</h3><a href={sourceDocs[classification]} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[#0071e3]">Original reference document<ExternalLink className="size-3.5" /></a></div>
        <div className="grid gap-2">
          {examples.map((example, index) => <details key={example.id} name="creator-reference-example" open={index === (classification === 'acceptable' ? 2 : 1)} className="overflow-hidden rounded-2xl border border-black/[0.07]" id={example.id}>
            <summary className="cursor-pointer px-4 py-4 text-sm font-semibold"><span className="mr-3 text-xs tabular-nums text-[#86868b]">{String(index + 1).padStart(2, '0')}</span>{example.title}</summary>
            <div className="border-t border-black/[0.055] p-4 sm:p-5">
              <p className={cn('mb-4 rounded-xl p-4 text-sm font-medium leading-6', classification === 'acceptable' ? 'bg-[#e5f7ea]/60 text-[#245333]' : 'bg-[#fff4ce]/60 text-[#755a19]')}>Source hook: “{example.hook}”</p>
              {example.images.length ? <div className={cn('grid gap-3', example.images.length > 1 && 'sm:grid-cols-2')}>{example.images.map((id) => {
                const [width, height] = imageSizes[id as keyof typeof imageSizes]
                return <figure key={id}><a href={`/creator-guide/${id}.webp`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-[#f5f5f7]" aria-label={`Open full-size source screenshot: ${example.title}`}><Image src={`/creator-guide/${id}.webp`} width={width} height={height} sizes="(max-width: 768px) 100vw, 900px" alt={`${example.title}: source video still${example.images.length === 1 ? ' and audience comments' : ''}`} className="h-auto max-h-[600px] w-full object-contain" /></a><figcaption className="mt-2 text-xs text-[#86868b]">Source screenshot · Open image to inspect the text</figcaption></figure>
              })}</div> : null}
              <div className="mt-5 grid gap-4 md:grid-cols-2"><div><h4 className="text-xs font-semibold uppercase tracking-wide text-[#86868b]">{classification === 'acceptable' ? 'Why it fits the reference' : 'Why it misses the brief'}</h4><p className="mt-2 text-sm leading-6 text-[#6e6e73]">{example.explanation}</p></div><div><h4 className="text-xs font-semibold uppercase tracking-wide text-[#86868b]">Apply this to Mogging</h4><p className="mt-2 text-sm leading-6 text-[#6e6e73]">{example.takeaway}</p></div></div>
            </div>
          </details>)}
        </div>
      </div>
      <JuneVideoIndex classification={classification} key={`index-${classification}`} />
    </section>
  )
}

function JuneVideoIndex({ classification }: { classification: Classification }) {
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState('all')
  const [page, setPage] = useState(0)
  const search = query.trim().toLowerCase().replace(/^@/, '').split(/[?#]/)[0]
  const matches = references.filter((item) => item.status === classification && (platform === 'all' || item.url.includes(platform)) && (!search || `${item.account} ${item.url}`.toLowerCase().includes(search)))
  const pageCount = Math.ceil(matches.length / pageSize)
  const visible = matches.slice(page * pageSize, (page + 1) * pageSize)
  return (
    <section className="border-t border-black/[0.055] bg-[#f5f5f7]/60 p-5 sm:p-6" aria-labelledby="june-index-title">
      <h3 id="june-index-title" className="scroll-mt-52 text-xl font-semibold tracking-tight">June 2026 video reference index</h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6e6e73]">All 2,261 spreadsheet entries are available across the two filters: 1,196 marked acceptable and 1,065 marked non-acceptable. Search an account or paste a video link to find its source classification.</p>
      <p className="mt-2 max-w-3xl text-xs leading-5 text-[#6e6e73]">The spreadsheets do not give individual review reasons. These labels are reproduced from the source, not new Mogging reviews or payout decisions. Links open on TikTok or Instagram and may require sign-in or no longer be available. The screenshot examples above are a separate reference set; no link-to-screenshot match is implied.</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1"><span className="sr-only">Search June videos by account or URL</span><Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-[#86868b]" /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} placeholder="Search account or video link" className="h-11 w-full rounded-xl border border-black/10 bg-white pl-10 pr-3 text-sm" /></label>
        <label><span className="sr-only">Video platform</span><select className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm sm:w-40" value={platform} onChange={(event) => { setPlatform(event.target.value); setPage(0) }}><option value="all">All platforms</option><option value="tiktok.com">TikTok</option><option value="instagram.com">Instagram</option></select></label>
      </div>
      <p className="mt-4 text-xs text-[#6e6e73]" aria-live="polite">{matches.length.toLocaleString('en-US')} {classification === 'acceptable' ? 'acceptable' : 'non-acceptable'} references{matches.length ? ` · ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, matches.length)}` : ''}</p>
      <ul className="mt-3 divide-y divide-black/[0.055] rounded-2xl border border-black/[0.07] bg-white">
        {visible.map((item) => <li key={item.url}><a href={item.url} target="_blank" rel="noreferrer" className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 hover:bg-[#f5f5f7]"><span className="min-w-0"><span className="block break-words text-sm font-semibold">@{item.account}</span><span className="mt-1 block text-xs text-[#86868b]">{item.url.includes('tiktok.com') ? 'TikTok' : 'Instagram'} · {classification === 'acceptable' ? 'Looks' : 'Not Looks'} sheet, row {item.row}</span></span><span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#0071e3]">Watch<ExternalLink className="size-3.5" /></span></a></li>)}
      </ul>
      {!matches.length ? <p className="py-6 text-sm text-[#6e6e73]">No matches in this classification. Try the other classification, a shorter account name, or all platforms.</p> : null}
      {pageCount > 1 ? <div className="mt-4 flex items-center justify-between gap-3"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="min-h-11 rounded-full border border-black/10 bg-white px-4 text-sm font-semibold disabled:opacity-40">Previous</button><span className="text-xs tabular-nums text-[#6e6e73]">Page {page + 1} of {pageCount}</span><button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)} className="min-h-11 rounded-full border border-black/10 bg-white px-4 text-sm font-semibold disabled:opacity-40">Next</button></div> : null}
    </section>
  )
}
