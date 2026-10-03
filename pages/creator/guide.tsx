import { creatorGuideTopics, creatorGuideTopic, creatorGuideHref, type CreatorGuideTopic } from '@/lib/creator/guide-navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { useState, type ReactNode } from 'react'
import {
  ArrowRight,
  ArrowLeft,
  Clock3,
  MessageCircle,
  Calculator,
  CalendarDays,
  Check,
  ChevronDown,
  ExternalLink,
  Link2,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
} from 'lucide-react'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import { ContentGuidelines, accountReviewPolicy, AnalyticsVerificationHelp, discordContactUrl } from '@/components/creator/content-guidelines'
import { Button } from '@/components/ui/button'
import useSWR from 'swr'
import { apiGet } from '@/lib/api/client'
import type { CreatorDashboard } from '@/components/creator/types'
import { cn } from '@/lib/utils'
import { CreatorIcon, type CreatorIconName } from '@/components/creator/creator-icon'
import { CreatorReferralLinks } from '@/components/creator/referral-links'

const GuideExamples = dynamic(() => import('@/components/creator/guide-examples'), { loading: () => <p className="p-6 text-sm text-[#73777d]" role="status">Loading reference examples…</p> })

const tierOneCountries = ['United States', 'Canada', 'United Kingdom', 'Australia', 'Germany', 'France', 'Netherlands', 'Sweden', 'Denmark', 'Switzerland', 'New Zealand', 'Poland', 'Italy', 'South Korea']

export default function CreatorProgramGuidePage() {
  const router = useRouter()
  const topic = creatorGuideTopic(router.query.topic, router.asPath)
  const selectedTopic = creatorGuideTopics.find((item) => item.id === topic)!

  return (
    <CreatorShell>
      {topic === 'start' ? <>
        <CreatorHeader eyebrow="Creator Guide" title="Let’s make your next great video." description="Start with what matters. Go deeper when you need to." />
        <GuideHome />
      </> : <div className="creator-guide-article w-full">
        <nav aria-label="Guide breadcrumb" className="mb-7 flex items-center gap-2 text-xs text-[#73777d]"><Link href="/creator/guide" className="inline-flex min-h-11 items-center gap-1.5 hover:text-[#00A8EF]"><ArrowLeft className="size-3.5" />Creator guide</Link><span>/</span><span className="text-[#181a1d]">{selectedTopic.label}</span></nav>
        {topic === 'video' ? <VideoGuide /> : null}
        {topic === 'improve' ? <ImproveGuide /> : null}
        {topic === 'rules' ? <RulesGuide /> : null}
        {topic === 'examples' ? <GuideExamples /> : null}
        {topic === 'payout' ? <PayoutGuide /> : null}
        {topic === 'account' ? <AccountGuide /> : null}
        {topic === 'referrals' ? <><GuidePanelHeader eyebrow="Share your link" title="Turn viewers into downloads." description="Use the personal link for the account you publish from so referrals go to the right account." /><CreatorReferralLinks /></> : null}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#eceef0] pt-5 text-sm"><Link href="/creator/guide" className="inline-flex min-h-11 items-center gap-2 font-medium"><ArrowLeft className="size-4" />All guides</Link><a href={discordContactUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-[#00A8EF]"><MessageCircle className="size-4" />Ask us on Discord</a></div>
      </div>}
    </CreatorShell>
  )
}

const startingQuestions = [
  { topic: 'video', icon: 'video-submissions', title: 'What kind of content should I make?', answer: 'Make an original video about looks: a feature breakdown, transformation, or clear comparison. Show Mogging and finish with a direct call to action.', link: 'Find your format' },
  { topic: 'improve', icon: 'cta', title: 'How can I improve my content?', answer: 'Start with a clear hook, make the product easy to understand, and check who your content attracts. Learn from examples before your next edit.', link: 'Make a better video' },
  { topic: 'payout', icon: 'payouts', title: 'How much / when do I get paid?', answer: 'Earnings depend on verified views and audience geography, up to $325 per video. Allow 3–5 days for payouts after approval.', link: 'Understand your earnings' },
] as const

function GuideHome() {
  const resources = [
    ['rules', 'Content rules', 'What qualifies, what gets rejected, and why.'],
    ['examples', 'Examples & references', 'Real footage, hooks, audience comments, and takeaways.'],
    ['referrals', 'Your referral links', 'Share the right link before you publish.'],
    ['account', 'Connect an account', 'Add your publishing profile and get your code.'],
  ] as const

  return <>
    <section aria-label="Start with these questions" className="grid gap-3 lg:grid-cols-3">
      {startingQuestions.map((item) => <Link key={item.topic} href={creatorGuideHref(item.topic)} className="group flex flex-col rounded-[20px] bg-[#f5f6f7] p-5 transition-colors hover:bg-[#eef0f2] sm:p-6"><CreatorIcon name={item.icon} className="mb-5 size-6 text-[#00A8EF]" /><h2 className="text-lg font-semibold leading-6 tracking-[-0.03em]">{item.title}</h2><p className="mt-3 text-sm leading-6 text-[#73777d]">{item.answer}</p><span className="mt-auto flex items-center justify-between gap-3 pt-6 text-xs font-semibold text-[#00A8EF]">{item.link}<ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" /></span></Link>)}
    </section>
    <section className="mt-10" aria-labelledby="explore-guide-title"><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#858a91]">Go a little deeper</p><h2 id="explore-guide-title" className="mt-2 text-xl font-semibold tracking-[-0.03em]">Find exactly what you need.</h2><div className="mt-5 grid gap-x-8 sm:grid-cols-2">{resources.map(([id, title, detail]) => <Link key={id} href={creatorGuideHref(id)} className="group flex items-center justify-between gap-3 border-t border-[#eceef0] py-5"><span><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-xs leading-5 text-[#73777d]">{detail}</span></span><ArrowRight className="size-4 shrink-0 text-[#858a91] transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-[#00A8EF]" /></Link>)}</div></section>
    <details className="mt-6 border-t border-[#eceef0] pt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Brand new? See the three-step overview</summary><QuickStart /></details>
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[16px] bg-[#f5f6f7] px-5 py-4"><div><p className="text-sm font-semibold">A question we haven’t answered?</p><p className="mt-0.5 text-xs text-[#73777d]">We’ll help you figure out your next step.</p></div><a href={discordContactUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#00A8EF]">Ask us on Discord<ArrowRight className="size-4" /></a></div>
  </>
}

function ImproveGuide() {
  return <section aria-label="Improve your content">
    <GuidePanelHeader eyebrow="Improve your content" title="Make every part of your edit count." description="A strong video makes its looks focus clear, shows the product, and attracts people who want to improve their own appearance." />
    <ol className="divide-y divide-[#eceef0]">{[
      ['Win the first three seconds', 'Introduce the problem, result, or transformation immediately. Make the hook match the footage and the caption.'],
      ['Show the product clearly', 'Let viewers understand what Mogging does. Use your own scan, report, or protocol to connect the product to the story.'],
      ['Give viewers a next step', 'Finish with a direct invitation to try Mogging. Keep the matching account’s personal referral link in its bio.'],
      ['Read the comments', 'Your framing determines who watches. Look for an audience interested in their own looks, rather than unrelated celebrity fans or music listeners.'],
    ].map(([title, detail], index) => <li key={title} className="flex gap-5 py-5"><span className="pt-0.5 text-xs tabular-nums text-[#858a91]">0{index + 1}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-[#73777d]">{detail}</p></div></li>)}</ol>
    <GuideDisclosure title="Recommended publishing cadence" meta="Optional guidance"><div className="flex items-start gap-3"><CalendarDays className="mt-0.5 size-5 shrink-0 text-[#00A8EF]" /><div><p className="text-sm font-semibold">Post daily on both platforms when possible.</p><p className="mt-1 text-xs leading-5 text-[#73777d]">The same creative posted to TikTok and Instagram counts as two separate posts and can earn separately. Top editors may publish 6–12 times daily, but quality still matters.</p></div></div></GuideDisclosure>
    <div className="mt-6 grid gap-3 sm:grid-cols-2"><GuideNext topic="examples" title="Learn from real examples" detail="Inspect the hook, footage, and audience." /><Link href="/creator/cta-generator" className="rounded-[16px] bg-[#f5f6f7] p-5"><h3 className="text-sm font-semibold">Build a clearer product moment</h3><p className="mt-1 text-xs leading-5 text-[#73777d]">Create CTAs, mock reports, and protocols in CTA Studio.</p><ArrowRight className="mt-4 size-4 text-[#00A8EF]" /></Link></div>
  </section>
}

function RulesGuide() {
  return <section aria-label="Content rules"><GuidePanelHeader eyebrow="Content rules" title="Make the looks focus unmistakable." description="Check these standards before publishing. A high view count does not make unrelated content eligible for payment." /><ContentGuidelines /></section>
}

function GuideNext({ topic, title, detail }: { topic: CreatorGuideTopic; title: string; detail: string }) {
  return <Link href={creatorGuideHref(topic)} className="group flex items-start justify-between gap-4 rounded-[16px] bg-[#f5f6f7] p-5"><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-[#73777d]">{detail}</p></div><ArrowRight className="mt-0.5 size-4 shrink-0 text-[#00A8EF] transition-transform duration-150 group-hover:translate-x-0.5" /></Link>
}

function QuickStart() {
  const steps = [
    ['1', 'Connect', 'Add the account you publish from.'],
    ['2', 'Publish', 'Follow one active video format.'],
    ['3', 'Submit', 'Send the post link and analytics.'],
  ]

  return (
    <section className="creator-surface overflow-hidden" aria-labelledby="quick-start-title">
      <div className="flex flex-col gap-3 border-b border-black/[0.055] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#858a91]">The whole process</p><h2 id="quick-start-title" className="mt-1 text-lg font-semibold tracking-[-0.03em]">Three steps from setup to review</h2></div>
        <Link href="/creator/accounts" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#00A8EF]">Start with an account<ArrowRight className="size-4" /></Link>
      </div>
      <ol className="grid sm:grid-cols-3">
        {steps.map(([number, title, detail], index) => (
          <li key={title} className={cn('flex items-start gap-3 p-5', index < steps.length - 1 && 'border-b border-black/[0.055] sm:border-b-0 sm:border-r')}>
            <span className="grid size-7 shrink-0 place-items-center rounded-full creator-tone-blue text-xs font-semibold text-[#00A8EF]">{number}</span>
            <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-[#73777d]">{detail}</p></div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function VideoGuide() {
  const { data, isLoading, error } = useSWR<CreatorDashboard>('/api/creator', apiGet)
  const formats = data?.availableFormats ?? []
  const [formatId, setFormatId] = useState('')
  const format = formats.find((item) => item.id === formatId) ?? formats[0]
  if (!format) return <section><GuidePanelHeader eyebrow="Create content" title="What kind of content should I make?" description="Start with an active brief, then follow its requirements." /><p className="text-sm text-[#73777d]" role="status">{isLoading ? 'Loading active formats…' : error ? 'Formats could not load. Please refresh to try again.' : 'No formats are accepting submissions right now.'}</p></section>

  return (
    <section id="guide-panel-video" aria-label="Create content">
      <GuidePanelHeader eyebrow="Create a Video" title="What kind of content should I make?" description="Build the post around a single brief, then submit the published link and a continuous analytics recording filmed with a second device." />
      <div className="mb-6"><GuideNext topic="rules" title="Know what qualifies before you edit" detail="Read the looks-focused standards and examples of rejected content." /></div>

      <div className="grid gap-6">
        {formats.length > 1 ? <label className="grid gap-2 text-xs font-semibold text-[#73777d]">Active format<select className="creator-field max-w-sm text-sm font-normal text-[#181a1d]" value={format.id} onChange={(event) => setFormatId(event.target.value)}>{formats.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}

        <div className="min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><h3 className="text-2xl font-semibold tracking-[-0.04em]">{format.name}</h3><p className="mt-0.5 text-sm leading-6 text-[#73777d]">{format.shortDescription}</p></div>
            <span className="w-fit shrink-0 rounded-full creator-tone-green px-2.5 py-1 text-[11px] font-semibold text-[#29CE53]">Accepting Submissions</span>
          </div>

          <ol className="mt-6 grid gap-3 sm:grid-cols-3">
            {format.elements.map((element, index) => <li key={element.title} className="rounded-[16px] bg-[#f7f8f9] p-4"><span className="text-[10px] font-semibold tabular-nums text-[#aeaeb2]">{String(index + 1).padStart(2, '0')}</span><p className="mt-3 text-sm font-semibold">{element.title}</p><p className="mt-1.5 text-xs leading-5 text-[#73777d]">{element.detail}</p></li>)}
          </ol>

          <div className="mt-5 grid gap-2">
            <GuideDisclosure title="Full requirements" meta={`${format.requirements.length} items`}>
              <Checklist items={format.requirements.filter(item => !item.startsWith('Submit within'))} />
            </GuideDisclosure>
            {format.notAllowed.length > 0 ? <GuideDisclosure title="What is not allowed" meta={`${format.notAllowed.length} items`} tone="danger">
              <Checklist items={format.notAllowed} prohibited />
            </GuideDisclosure> : null}
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-[#eceef0] pt-6">
        <h3 className="text-sm font-semibold">What you’ll submit</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Evidence icon={ExternalLink} title="Published Post URL" detail="A public TikTok or Instagram link." />
          <Evidence icon={Smartphone} title="Physical Analytics Recording" detail="Film with a second device: views, traffic sources, and complete audience location data." />
          <Evidence icon={ShieldCheck} title="Final Confirmation" detail="Confirm the video follows the selected brief." />
        </div>
        <p className="mt-4 text-xs leading-5 text-[#858a91]">Follow the submission window and brief shown in your selected campaign, and keep the post public while it is under review.</p><AnalyticsVerificationHelp />
      </div>
    </section>
  )
}

function AccountGuide() {
  return <section id="guide-panel-account" aria-label="Connecting accounts"><GuidePanelHeader eyebrow="Publishing profiles" title="Connect once. Share your code." description="Enter your TikTok or Instagram handle or profile URL. Your permanent referral code appears immediately after connecting." action={<Button asChild><Link href="/creator/accounts">Manage accounts<ArrowRight /></Link></Button>} /><ol className="grid gap-3 sm:grid-cols-3"><AccountStep number="1" icon={Link2} title="Add your profile" detail="Choose TikTok or Instagram and enter one handle or profile URL." /><AccountStep number="2" icon={ShieldCheck} title="Copy your code" detail="Your permanent code stays connected to that publishing profile and its attribution history." /><AccountStep number="3" icon={Smartphone} title="Create & submit" detail="Follow an active campaign’s brief. Every video submission still needs its own second-device analytics recording." /></ol><p className="mt-5 rounded-2xl bg-[#f5f6f7] p-5 text-sm leading-6 text-zinc-500">Account connection no longer requires OAuth or an audience recording. Video analytics are verified separately during submission review.</p></section>
}

function PayoutGuide() {
  return <section id="guide-panel-payout" aria-label="Earnings and payouts"><GuidePanelHeader eyebrow="Campaigns & Money" title="How much / when do I get paid?" description="Each campaign sets its own budget, milestones, audience thresholds and requirements. Check the campaign before you create." action={<Button asChild><Link href="/creator/sprints">Explore campaigns<ArrowRight /></Link></Button>} /><div className="grid gap-3 sm:grid-cols-3"><PayoutFact value="Campaigns" label="Each campaign has its own rates and budget" /><PayoutFact value="Verified" label="Your recording determines eligible views and audience" /><PayoutFact value="3–5 days" label="Typical payment processing after approval" /></div><div className="mt-6 grid gap-3"><GuideDisclosure title="How campaign earnings work" meta="Rates & budget"><p className="text-sm leading-6 text-zinc-500">The milestone amounts displayed in a campaign are its maximum Tier 1 payouts. Your verified audience determines the payout using the campaign’s audience tiers or scaling rules. You must reach its minimum views and audience threshold. Milestones are total payouts, not stacked bonuses. Approval is subject to available campaign budget. The campaign terms saved when you submit remain attached to that video.</p></GuideDisclosure><GuideDisclosure title="Where to track your money" meta="Wallet, cashouts, earnings"><p className="text-sm leading-6 text-zinc-500">Wallet shows your approved unpaid balance once you select a payout method. Earnings lists eligible reviewed videos awaiting payment. Cashouts lists payments actually sent. Add or update PayPal or crypto in Payout methods.</p><Link href="/creator/money" className="mt-3 inline-block text-sm text-[#00A8EF]">Open Money →</Link></GuideDisclosure><GuideDisclosure title="Content eligibility and review holds" meta="Before payment" tone="warning"><p className="text-sm leading-6 text-zinc-500">Every post must satisfy its campaign brief and rules. Provide genuine, readable second-device analytics evidence and resolve any requested moderation checks. {accountReviewPolicy}</p><AnalyticsVerificationHelp /></GuideDisclosure><div id="audience-tiers"><GuideDisclosure title="Tier 1 countries" meta={`${tierOneCountries.length} countries`}><div className="flex flex-wrap gap-2">{tierOneCountries.map(country => <span key={country} className="rounded-full bg-[#f5f6f7] px-3 py-1.5 text-xs">{country}</span>)}</div><p className="mt-3 text-xs text-zinc-500">Combine the audience share from these countries. Minimum and maximum percentages are defined by your campaign.</p></GuideDisclosure></div></div><p className="mt-6 rounded-2xl bg-[#f5f6f7] p-5 text-sm text-zinc-500">Choose a payout destination before payment is released. Historical submissions keep their original payout terms.</p></section>
}

function GuidePanelHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><div><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#858a91]">{eyebrow}</p><h1 className="mt-1 text-[28px] font-medium leading-tight tracking-[-0.04em] sm:text-[32px]">{title}</h1><p className="mt-0.5 text-sm leading-6 text-[#73777d]">{description}</p></div></div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

function GuideDisclosure({ title, meta, children, tone = 'default' }: { title: string; meta: string; children: ReactNode; tone?: 'default' | 'warning' | 'danger' }) {
  return (
    <details className={cn('guide-disclosure rounded-[16px] border', tone === 'danger' || tone === 'warning' ? 'creator-warning' : 'border-[#eceef0] bg-white')}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 text-sm font-semibold marker:content-none">
        {tone === 'danger' ? <TriangleAlert className="size-4 shrink-0 text-red-700" /> : tone === 'warning' ? <TriangleAlert className="size-4 shrink-0 text-[#52565c]" /> : null}
        <span className="min-w-0 flex-1">{title}</span>
        <span className="text-[11px] font-normal text-[#858a91]">{meta}</span>
        <ChevronDown className="guide-disclosure-chevron size-4 shrink-0 text-[#858a91]" />
      </summary>
      <div className="border-t border-black/[0.055] px-4 py-4">{children}</div>
    </details>
  )
}

function Checklist({ items, prohibited = false }: { items: ReadonlyArray<string>; prohibited?: boolean }) {
  return <ul className="grid gap-3 sm:grid-cols-2">{items.map((item) => <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-[#73777d]">{prohibited ? <TriangleAlert className="mt-1 size-4 shrink-0 text-red-700" /> : <Check className="mt-1 size-4 shrink-0 text-[#29CE53]" />}<span>{item}</span></li>)}</ul>
}

function Evidence({ icon: Icon, title, detail }: { icon: typeof Smartphone; title: string; detail: string }) {
  return <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-white text-[#00A8EF] shadow-sm"><Icon className="size-4" /></span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-[#73777d]">{detail}</p></div></div>
}

function AccountStep({ number, icon: Icon, title, detail }: { number: string; icon: typeof Link2; title: string; detail: string }) {
  return <li className="rounded-[16px] bg-[#f7f8f9] p-4"><div className="flex items-center justify-between"><span className="grid size-9 place-items-center rounded-[12px] bg-white text-[#00A8EF] shadow-sm"><Icon className="size-4" /></span><span className="text-[10px] font-semibold text-[#aeaeb2]">{number.padStart(2, '0')}</span></div><p className="mt-4 text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-[#73777d]">{detail}</p></li>
}

function PayoutFact({ value, label }: { value: string; label: string }) {
  return <div className="rounded-[16px] bg-[#f7f8f9] p-5"><p className="text-2xl font-semibold tabular-nums tracking-[-0.045em]">{value}</p><p className="mt-2 text-xs leading-5 text-[#73777d]">{label}</p></div>
}
