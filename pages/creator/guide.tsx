import { AccordionTrigger, AccordionChevron, Disclosure, DisclosureSummary, AccordionContent } from '@/components/ui/accordion'
import { ContentRestrictions } from '@/components/creator/content-restrictions'
import { CreatorEssentials } from '@/components/creator/creator-essentials'
import { creatorCampaignRules, creatorFormatElement, CREATOR_CTA_GUIDANCE } from '@/lib/creator/post-guidance'
import { creatorGuideTopics, creatorGuideTopic, creatorGuideHref, type CreatorGuideTopic } from '@/lib/creator/guide-navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { useState, type ReactNode } from 'react'
import {
  ArrowRight,
  ArrowLeft,
  MessageCircle,
  CalendarDays,
  Check,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
} from 'lucide-react'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import { ContentGuidelines, TikTokAnchorGuidelines, AnalyticsVerificationHelp, discordContactUrl } from '@/components/creator/content-guidelines'
import useSWR from 'swr'
import { apiGet } from '@/lib/api/client'
import { creatorCampaignFormats, type CreatorSprint } from '@/lib/creator/sprints'
import { cn } from '@/lib/utils'
import { CreatorIcon, type CreatorIconName } from '@/components/creator/creator-icon'
import { CreatorReferralLinks } from '@/components/creator/referral-links'

const GuideExamples = dynamic(() => import('@/components/creator/guide-examples'), { loading: () => <p className="p-6 text-sm text-[#73777d]" role="status">Loading reference examples…</p> })


export default function CreatorProgramGuidePage() {
  const router = useRouter()
  const topic = creatorGuideTopic(router.query.topic, router.asPath)
  const selectedTopic = creatorGuideTopics.find((item) => item.id === topic)!

  return (
    <CreatorShell>
      {topic === 'start' ? <>
        <CreatorHeader eyebrow="Creator Guide" title="Let’s make your next great post." description="Start with what matters. Go deeper when you need to." />
        <GuideHome />
      </> : <div className="creator-guide-article w-full">
        <nav aria-label="Guide breadcrumb" className="mb-7 flex items-center gap-2 text-xs text-[#73777d]"><Link href="/creator/guide" className="inline-flex min-h-11 items-center gap-1.5 hover:text-[#00A8EF]"><ArrowLeft className="size-3.5" />Creator guide</Link><span>/</span><span className="text-[#181a1d]">{selectedTopic.label}</span></nav>
        {topic === 'video' ? <VideoGuide /> : null}
        {topic === 'improve' ? <ImproveGuide /> : null}
        {topic === 'rules' ? <RulesGuide /> : null}
        {topic === 'examples' ? <GuideExamples /> : null}
        {topic === 'referrals' ? <><GuidePanelHeader eyebrow="Share your link" title="Turn viewers into downloads." description="Use the personal link for the account you publish from so referrals go to the right account." /><CreatorReferralLinks /></> : null}
        {topic === 'video' ? <div className="mt-8"><CreatorEssentials /></div> : null}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#eceef0] pt-5 text-sm"><Link href="/creator/guide" className="inline-flex min-h-11 items-center gap-2 font-medium"><ArrowLeft className="size-4" />All guides</Link><a href={discordContactUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-[#00A8EF]"><MessageCircle className="size-4" />Ask us on Discord</a></div>
      </div>}
    </CreatorShell>
  )
}

const startingQuestions = [
  { topic: 'video', icon: 'video-submissions', title: 'What kind of content should I make?', answer: 'Make an original looksmaxxing or ascension-focused video or slideshow. Choose what historically works best for your audience, show Mogging, and invite viewers to try it.', link: 'Find your format' },
  { topic: 'improve', icon: 'cta', title: 'How can I improve my content?', answer: 'Start with a clear hook, make the product easy to understand, and check who your content attracts. Learn from examples before your next edit.', link: 'Improve your content' },
] as const

function GuideHome() {
  const resources = [
    ['rules', 'Content rules', 'What qualifies, what gets rejected, and why.'],
    ['examples', 'Examples & references', 'Real footage, hooks, audience comments, and takeaways.'],
    ['referrals', 'Your referral links & codes', 'Copy your link or code before you publish.'],
  ] as const

  return <>
    <section aria-label="Start with these questions" className="grid gap-3 sm:grid-cols-2">
      {startingQuestions.map((item) => <Link key={item.topic} href={creatorGuideHref(item.topic)} className="group flex flex-col rounded-[20px] bg-[#f5f6f7] p-5 transition-colors hover:bg-[#eef0f2] sm:p-6"><CreatorIcon name={item.icon} className="mb-5 size-6 text-[#00A8EF]" /><h2 className="text-lg font-semibold leading-6 tracking-[-0.03em]">{item.title}</h2><p className="mt-3 text-sm leading-6 text-[#73777d]">{item.answer}</p><span className="mt-auto flex items-center justify-between gap-3 pt-6 text-xs font-semibold text-[#00A8EF]">{item.link}<ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" /></span></Link>)}
    </section>
    <section className="mt-10" aria-labelledby="explore-guide-title"><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#858a91]">Go a little deeper</p><h2 id="explore-guide-title" className="mt-2 text-xl font-semibold tracking-[-0.03em]">Find exactly what you need.</h2><div className="mt-5 grid gap-x-8 sm:grid-cols-2">{resources.map(([id, title, detail]) => <Link key={id} href={creatorGuideHref(id)} className="group flex items-center justify-between gap-3 border-t border-[#eceef0] py-5"><span><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-xs leading-5 text-[#73777d]">{detail}</span></span><ArrowRight className="size-4 shrink-0 text-[#858a91] transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-[#00A8EF]" /></Link>)}</div></section>
    <Disclosure className="mt-6 border-t border-[#eceef0] pt-3"><DisclosureSummary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Brand new? See the three-step overview</DisclosureSummary><AccordionContent><QuickStart /></AccordionContent></Disclosure>
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[16px] bg-[#f5f6f7] px-5 py-4"><div><p className="text-sm font-semibold">A question we haven’t answered?</p><p className="mt-0.5 text-xs text-[#73777d]">We’ll help you figure out your next step.</p></div><a href={discordContactUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#00A8EF]">Ask us on Discord<ArrowRight className="size-4" /></a></div>
  </>
}

function ImproveGuide() {
  return <section aria-label="Improve your content">
    <GuidePanelHeader eyebrow="Improve your content" title="Make every part of your edit count." description="A strong video or slideshow makes its looksmaxxing or ascension focus clear, shows Mogging, and attracts people who want to improve their appearance. Build on the format and style that already work for your audience." />
    <div className="mb-6 divide-y divide-[#eceef0]">
      <section className="py-5 first:pt-0" aria-labelledby="warm-up-account">
        <h2 id="warm-up-account" className="text-lg font-semibold tracking-[-0.02em]">1. Warm up your account</h2>
        <p className="mt-2 text-sm leading-6 text-[#73777d]">Spend a little time on your feed every day. Watch relevant looksmaxxing, ascension, and transformation posts, follow creators you enjoy, and leave thoughtful comments. Pay attention to hooks, pacing, and questions people ask, then use those observations in your own posts.</p>
        <p className="mt-2 text-sm leading-6 text-[#73777d]">Engage naturally before and after publishing, and reply to your own comments. This helps you learn the community and personalize what you see; it is not a guaranteed reach boost. Skip repetitive comments, engagement swaps, and automated activity.</p>
      </section>
      <section className="py-5" aria-labelledby="audience-connection">
        <h2 id="audience-connection" className="text-lg font-semibold tracking-[-0.02em]">2. Proxies, VPNs, and your audience</h2>
        <p className="mt-2 text-sm leading-6 text-[#73777d]">A proxy or VPN changes your connection’s IP address. It does not guarantee that your posts will reach a particular country. TikTok uses several signals, including viewer interactions, content, language, and location.</p>
        <p className="mt-2 text-sm leading-6 text-[#73777d]">If you use a proxy or VPN, keep the connection consistent while you compare results. Build for the audience you want: use their language, relevant examples, and publishing times. Change one thing at a time and compare the actual audience countries in your post analytics. Base submissions on those recorded results.</p>
        <a href="https://support.tiktok.com/en/using-tiktok/exploring-videos/how-tiktok-recommends-content" target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-[#00A8EF]">How TikTok recommends content<ExternalLink className="size-3" aria-hidden="true" /></a>
      </section>
      <section className="py-5" aria-labelledby="talk-to-viewers">
        <h2 id="talk-to-viewers" className="text-lg font-semibold tracking-[-0.02em]">3. Talk directly to viewers</h2>
        <p className="mt-2 text-sm leading-6 text-[#73777d]">Speak to one person, give them a clear reason to respond, and connect the question to the product moment. Try a direct opening, a specific question, or a genuine free-analysis offer.</p>
        <ul className="mt-3 grid gap-2 text-sm leading-6 text-[#73777d]">
          <li className="rounded-xl bg-[#f5f6f7] px-4 py-3">“Stop right now—want feedback on your look? Send me a photo privately.”</li>
          <li className="rounded-xl bg-[#f5f6f7] px-4 py-3">“Which part of your look would you work on first? Tell me in the comments.”</li>
          <li className="rounded-xl bg-[#f5f6f7] px-4 py-3">“Comment ANALYSIS for a chance to get a free analysis.”</li>
        </ul>
        <p className="mt-3 text-sm leading-6 text-[#73777d]">Only advertise a free analysis when you will actually provide it. Explain how many people you will choose, when you will choose them, and how they will receive it. Reply to useful comments and turn recurring questions into your next post. Keep photo sharing optional and private.</p>
      </section>
    </div>
    <h2 className="text-lg font-semibold tracking-[-0.02em]">Make the edit work harder</h2>
    <ol className="divide-y divide-[#eceef0]">{[
      ['Make the opening count', 'Introduce the problem, result, or transformation in the first few seconds or opening slide. Make the hook match the video footage or slideshow images and caption.'],
      ['Show the product clearly', 'Let viewers understand what Mogging does. Use your own scan, report, or protocol to connect the product to the story.'],
      ['Give viewers a next step', `${CREATOR_CTA_GUIDANCE} Include your matching account’s referral code in the caption.`],
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
    ['2', 'Publish', 'Choose a video or slideshow and follow an active campaign brief.'],
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
  const { data, isLoading, error } = useSWR<{ sprints: CreatorSprint[] }>('/api/creator/sprints', apiGet)
  const formats = creatorCampaignFormats(data?.sprints ?? [])
  const [formatId, setFormatId] = useState('')
  const selected = formats.find((item) => item.key === formatId) ?? formats[0]
  const format = selected?.format
  if (!format) return <section><GuidePanelHeader eyebrow="Create content" title="What kind of content should I make?" description="Start with an active brief, then follow its requirements." /><p className="text-sm text-[#73777d]" role="status">{isLoading ? 'Loading active formats…' : error ? 'Formats could not load. Please refresh to try again.' : 'No formats are accepting submissions right now.'}</p></section>

  return (
    <section id="guide-panel-video" aria-label="Create content">
      <GuidePanelHeader eyebrow="Create content" title="What kind of content should I make?" description="Videos and slideshows are both welcome. Choose the format that historically works best for your audience and make it clearly looksmaxxing or ascension focused. You have creative freedom within the campaign brief; submit the published link and a continuous analytics recording filmed with a second device." />
      <TikTokAnchorGuidelines />
      <div className="mb-6"><GuideNext topic="rules" title="Know what qualifies before you edit" detail="Read the looks-focused standards and examples of rejected content." /></div>

      <div className="grid gap-6">
        {formats.length > 1 ? <label className="grid gap-2 text-xs font-semibold text-[#73777d]">Active format<select className="creator-field max-w-sm text-sm font-normal text-[#181a1d]" value={selected.key} onChange={(event) => setFormatId(event.target.value)}>{formats.map((item) => <option key={item.key} value={item.key}>{item.campaignName} · {item.format.name}</option>)}</select></label> : null}

        <div className="min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><h3 className="text-2xl font-semibold tracking-[-0.04em]">{format.name}</h3><p className="mt-0.5 text-sm leading-6 text-[#73777d]">{format.shortDescription}</p></div>
            <span className="w-fit shrink-0 rounded-lg creator-tone-green px-2.5 py-1 text-[11px] font-semibold text-[#29CE53]">Accepting Submissions</span>
          </div>

          <ol className="mt-6 grid gap-3 sm:grid-cols-3">
            {format.elements.map(creatorFormatElement).map((element, index) => <li key={element.title} className="rounded-[16px] bg-[#f7f8f9] p-4"><span className="text-[10px] font-semibold tabular-nums text-[#aeaeb2]">{String(index + 1).padStart(2, '0')}</span><p className="mt-3 text-sm font-semibold">{element.title}</p><p className="mt-1.5 text-xs leading-5 text-[#73777d]">{element.detail}</p></li>)}
          </ol>

          <div className="mt-5 grid gap-2">
            <GuideDisclosure title="Full requirements" meta={`${creatorCampaignRules(format.requirements).length} items`}>
              <Checklist items={creatorCampaignRules(format.requirements)} />
            </GuideDisclosure>
            <ContentRestrictions rules={format.notAllowed} />
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-[#eceef0] pt-6">
        <h3 className="text-sm font-semibold">What you’ll submit</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Evidence icon={ExternalLink} title="Published Post URL" detail="A public TikTok or Instagram link." />
          <Evidence icon={Smartphone} title="Physical Analytics Recording" detail="Film with a second device: views, traffic sources, and complete audience location data." />
          <Evidence icon={ShieldCheck} title="Final Confirmation" detail="Confirm the video or slideshow follows the selected brief." />
        </div>
        <p className="mt-4 text-xs leading-5 text-[#858a91]">Follow the brief shown in your selected campaign, and keep the post public while it is under review.</p><AnalyticsVerificationHelp />
      </div>
    </section>
  )
}

function GuidePanelHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><div><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#858a91]">{eyebrow}</p><h1 className="mt-1 text-[28px] font-medium leading-tight tracking-[-0.04em] sm:text-[32px]">{title}</h1><p className="mt-0.5 text-sm leading-6 text-[#73777d]">{description}</p></div></div>
    </header>
  )
}

function GuideDisclosure({ title, meta, children, tone = 'default' }: { title: string; meta: string; children: ReactNode; tone?: 'default' | 'warning' | 'danger' }) {
  return (
    <Disclosure className={cn('guide-disclosure rounded-[16px] border', tone === 'danger' || tone === 'warning' ? 'creator-warning' : 'border-[#eceef0] bg-white')}>
      <AccordionTrigger className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left text-sm font-semibold">
        {tone === 'danger' ? <TriangleAlert className="size-4 shrink-0 text-red-700" /> : tone === 'warning' ? <TriangleAlert className="size-4 shrink-0 text-[#52565c]" /> : null}
        <span className="min-w-0 flex-1">{title}</span>
        <span className="text-[11px] font-normal text-[#858a91]">{meta}</span>
        <AccordionChevron />
      </AccordionTrigger><AccordionContent>
      <div className="border-t border-black/[0.055] px-4 py-4">{children}</div>
    </AccordionContent></Disclosure>
  )
}

function Checklist({ items, prohibited = false }: { items: ReadonlyArray<string>; prohibited?: boolean }) {
  return <ul className="grid gap-3 sm:grid-cols-2">{items.map((item) => <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-[#73777d]">{prohibited ? <TriangleAlert className="mt-1 size-4 shrink-0 text-red-700" /> : <Check className="mt-1 size-4 shrink-0 text-[#29CE53]" />}<span>{item}</span></li>)}</ul>
}

function Evidence({ icon: Icon, title, detail }: { icon: typeof Smartphone; title: string; detail: string }) {
  return <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-white text-[#00A8EF] shadow-sm"><Icon className="size-4" /></span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-[#73777d]">{detail}</p></div></div>
}
