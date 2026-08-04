import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Calculator,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  ExternalLink,
  FileVideo2,
  ImageIcon,
  Link2,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  UsersRound,
} from 'lucide-react'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import { CreatorPayoutCalculator } from '@/components/creator/payout-calculator'
import { Button } from '@/components/ui/button'
import { ACTIVE_CREATOR_SUBMISSION_FORMATS } from '@/lib/creator/formats'
import { cn } from '@/lib/utils'

type GuideTopic = 'video' | 'account' | 'payout'

const guideTopics = [
  { id: 'video', label: 'Create a Video', detail: 'Formats and evidence', icon: FileVideo2 },
  { id: 'account', label: 'Verify an Account', detail: 'Analytics and bio link', icon: BadgeCheck },
  { id: 'payout', label: 'Understand Payouts', detail: 'Audience and earnings', icon: CircleDollarSign },
] as const

const accountChecks = [
  ['Physical recording', 'Use a second phone or camera. Native screen recordings are not accepted.'],
  ['Visible identity', 'Keep the connected username readable throughout the recording.'],
  ['Recent analytics', 'Show the most recent 28-day window, or the closest platform option.'],
  ['Audience geography', 'Open Locations and show the complete country or territory list.'],
  ['One continuous take', 'Do not cut, edit, hide screens, or alter analytics.'],
  ['Readable evidence', 'Move slowly enough for every screen and value to be reviewed.'],
] as const

const statusItems = [
  ['Needs Verification', 'Connected, but analytics evidence is still required.', 'danger'],
  ['Pending Review', 'Verification was submitted and is being checked.', 'warning'],
  ['Approved', 'The account is ready for eligible creator posts.', 'success'],
  ['Missing Information', 'The team needs clearer or additional evidence.', 'danger'],
] as const

const tierOneCountries = ['United States', 'Canada', 'United Kingdom', 'Australia', 'Germany', 'France', 'Netherlands', 'Sweden', 'Denmark', 'Switzerland', 'New Zealand', 'Poland', 'Italy', 'South Korea']
const payoutThresholds = ['40K', '100K', '250K', '500K', '750K', '+1M']

export default function CreatorProgramGuidePage() {
  const [topic, setTopic] = useState<GuideTopic>('video')

  return (
    <CreatorShell>
      <CreatorHeader
        eyebrow="Creator Resources"
        title="Creator Program Guide"
        description="Choose what you’re working on. We’ll show only the information you need for that step."
        action={<Button asChild className="h-11 rounded-full px-5"><Link href="/creator/submit">Submit a Video<ArrowRight /></Link></Button>}
      />

      <QuickStart />
      <TopicPicker selected={topic} onSelect={setTopic} />

      <div className="mt-5">
        {topic === 'video' ? <VideoGuide /> : null}
        {topic === 'account' ? <AccountGuide /> : null}
        {topic === 'payout' ? <PayoutGuide /> : null}
      </div>
    </CreatorShell>
  )
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
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#86868b]">The whole process</p><h2 id="quick-start-title" className="mt-1 text-lg font-semibold tracking-[-0.03em]">Three steps from setup to review</h2></div>
        <Link href="/creator/accounts" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0071e3]">Start with an account<ArrowRight className="size-4" /></Link>
      </div>
      <ol className="grid sm:grid-cols-3">
        {steps.map(([number, title, detail], index) => (
          <li key={title} className={cn('flex items-start gap-3 p-5', index < steps.length - 1 && 'border-b border-black/[0.055] sm:border-b-0 sm:border-r')}>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e8f2ff] text-xs font-semibold text-[#0071e3]">{number}</span>
            <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-[#6e6e73]">{detail}</p></div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function TopicPicker({ selected, onSelect }: { selected: GuideTopic; onSelect: (topic: GuideTopic) => void }) {
  return (
    <div className="mt-8">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-[#86868b]">What do you need help with?</p>
      <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Creator guide topics">
        {guideTopics.map((item) => {
          const active = selected === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`guide-panel-${item.id}`}
              onClick={() => onSelect(item.id)}
              className={cn('flex items-center gap-3 rounded-[16px] border p-3.5 text-left transition-[border-color,background-color,box-shadow,transform] duration-150 active:scale-[0.98]', active ? 'border-[#0071e3]/30 bg-[#e8f2ff] text-[#0071e3] shadow-[0_0_0_3px_rgba(0,113,227,0.06)]' : 'border-black/[0.07] bg-white/80 text-[#6e6e73] hover:bg-white')}
            >
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-[12px]', active ? 'bg-white' : 'bg-[#f5f5f7]')}><Icon className="size-[17px]" /></span>
              <span><span className="block text-sm font-semibold text-[#1d1d1f]">{item.label}</span><span className="mt-0.5 block text-[11px]">{item.detail}</span></span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function VideoGuide() {
  const [formatId, setFormatId] = useState(ACTIVE_CREATOR_SUBMISSION_FORMATS[0]?.id ?? '')
  const format = ACTIVE_CREATOR_SUBMISSION_FORMATS.find((item) => item.id === formatId) ?? ACTIVE_CREATOR_SUBMISSION_FORMATS[0]
  if (!format) return null

  return (
    <section id="guide-panel-video" role="tabpanel" className="creator-surface overflow-hidden">
      <GuidePanelHeader icon={FileVideo2} eyebrow="Create a Video" title="Choose one active format" description="Build the post around a single brief, then submit the published link and a clear analytics screenshot." />

      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          <p className="text-xs font-semibold text-[#6e6e73]">Active formats</p>
          <div className="mt-2 grid gap-2">
            {ACTIVE_CREATOR_SUBMISSION_FORMATS.map((item) => {
              const active = item.id === format.id
              return <button key={item.id} type="button" onClick={() => setFormatId(item.id)} className={cn('rounded-[14px] px-3.5 py-3 text-left text-sm font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.98]', active ? 'bg-[#1d1d1f] text-white' : 'bg-[#f5f5f7] text-[#6e6e73] hover:text-[#1d1d1f]')}>{item.name}</button>
            })}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><h3 className="text-2xl font-semibold tracking-[-0.04em]">{format.name}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-[#6e6e73]">{format.shortDescription}</p></div>
            <span className="w-fit shrink-0 rounded-full bg-[#e5f7ea] px-2.5 py-1 text-[11px] font-semibold text-[#248a3d]">Accepting Submissions</span>
          </div>

          <ol className="mt-6 grid gap-3 sm:grid-cols-3">
            {format.elements.map((element, index) => <li key={element.title} className="rounded-[16px] bg-[#f5f5f7] p-4"><span className="text-[10px] font-semibold tabular-nums text-[#aeaeb2]">{String(index + 1).padStart(2, '0')}</span><p className="mt-3 text-sm font-semibold">{element.title}</p><p className="mt-1.5 text-xs leading-5 text-[#6e6e73]">{element.detail}</p></li>)}
          </ol>

          <div className="mt-5 grid gap-2">
            <GuideDisclosure title="Full requirements" meta={`${format.requirements.length} items`}>
              <Checklist items={format.requirements} />
            </GuideDisclosure>
            <GuideDisclosure title="What is not allowed" meta={`${format.notAllowed.length} items`} tone="warning">
              <Checklist items={format.notAllowed} warning />
            </GuideDisclosure>
          </div>
        </div>
      </div>

      <div className="border-t border-black/[0.055] bg-[#f5f5f7]/70 p-5 sm:p-6">
        <h3 className="text-sm font-semibold">What you’ll submit</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Evidence icon={ExternalLink} title="Published Post URL" detail="A public TikTok or Instagram link." />
          <Evidence icon={ImageIcon} title="Analytics Screenshot" detail="Views, traffic sources, and audience location." />
          <Evidence icon={ShieldCheck} title="Final Confirmation" detail="Confirm the video follows the selected brief." />
        </div>
        <p className="mt-4 text-xs leading-5 text-[#86868b]">Submit within 30 days of publishing and keep the post public while it is under review.</p>
      </div>
    </section>
  )
}

function AccountGuide() {
  return (
    <section id="guide-panel-account" role="tabpanel" className="creator-surface overflow-hidden">
      <GuidePanelHeader icon={BadgeCheck} eyebrow="Verify an Account" title="Connect first. Verify second." description="Every TikTok or Instagram account gets its own creator link. Analytics verification makes it eligible for reviewed submissions." action={<Button asChild variant="outline" className="h-10 rounded-full border-black/10 bg-white px-4 text-[#0071e3]"><Link href="/creator/accounts">Manage Accounts<ArrowRight /></Link></Button>} />

      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <div>
          <ol className="grid gap-3 sm:grid-cols-3">
            <AccountStep number="1" icon={Link2} title="Connect" detail="Add up to five accounts per platform." />
            <AccountStep number="2" icon={Smartphone} title="Record" detail="Film the analytics walkthrough with a second device." />
            <AccountStep number="3" icon={ShieldCheck} title="Review" detail="Submit the recording and follow its status." />
          </ol>

          <div className="mt-5 grid gap-2">
            <GuideDisclosure title="Analytics recording checklist" meta="6 checks">
              <div className="grid gap-3 sm:grid-cols-2">{accountChecks.map(([title, detail]) => <div key={title} className="flex items-start gap-3"><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#e5f7ea] text-[#248a3d]"><Check className="size-3" /></span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-[#6e6e73]">{detail}</p></div></div>)}</div>
            </GuideDisclosure>
            <GuideDisclosure title="What each review status means" meta="4 statuses">
              <div className="grid gap-2 sm:grid-cols-2">{statusItems.map(([label, detail, tone]) => <StatusRow key={label} label={label} detail={detail} tone={tone} />)}</div>
            </GuideDisclosure>
            <GuideDisclosure title="Recommended publishing cadence" meta="Optional guidance">
              <div className="flex items-start gap-3"><CalendarDays className="mt-0.5 size-5 shrink-0 text-[#0071e3]" /><div><p className="text-sm font-semibold">Post daily on both platforms when possible.</p><p className="mt-1 text-xs leading-5 text-[#6e6e73]">The same creative posted to TikTok and Instagram counts as two separate posts and can earn separately. Top editors may publish 6–12 times daily, but quality still matters.</p></div></div>
            </GuideDisclosure>
          </div>
        </div>

        <aside className="h-fit rounded-[18px] bg-[#f5f5f7] p-5">
          <span className="grid size-10 place-items-center rounded-[14px] bg-white text-[#0071e3] shadow-sm"><Link2 className="size-[18px]" /></span>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.13em] text-[#86868b]">Required in every bio</p>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em]">Use the account’s personal link</h3>
          <div className="mt-4 rounded-[14px] bg-white p-4 text-sm leading-6 shadow-sm"><p>🧬 Get your Mogging Scan. Ascend in 90 days</p><p>📱 Download Mogging on the App Store</p></div>
          <p className="mt-4 text-xs leading-5 text-[#6e6e73]">Each connected account receives a different attribution link. Keep the matching link in that account’s bio while posting for the program.</p>
        </aside>
      </div>
    </section>
  )
}

function PayoutGuide() {
  const [calculatorOpen, setCalculatorOpen] = useState(false)

  return (
    <section id="guide-panel-payout" role="tabpanel" className="creator-surface overflow-hidden">
      <GuidePanelHeader icon={CircleDollarSign} eyebrow="Understand Payouts" title="Views qualify. Audience quality sets the rate." description="Choose the view threshold and audience tier shown in your post analytics. The review team verifies both before approving payment." action={<Button asChild variant="outline" className="h-10 rounded-full border-black/10 bg-white px-4 text-[#0071e3]"><Link href="/creator/payout-information">Set Up Payouts<ArrowRight /></Link></Button>} />

      <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
        <PayoutFact value="20%+" label="Combined Tier-1 audience for base eligibility" />
        <PayoutFact value="22.5%" label="U.S. audience where enhanced rates begin" />
        <PayoutFact value="$325" label="Maximum payout for one video" />
      </div>

      <div className="border-t border-black/[0.055] p-5 sm:p-6">
        <button type="button" onClick={() => setCalculatorOpen((open) => !open)} aria-expanded={calculatorOpen} className="flex w-full items-center gap-4 rounded-[18px] bg-[#e8f2ff] p-4 text-left text-[#0071e3] transition-[background-color,transform] duration-150 hover:bg-[#dcecff] active:scale-[0.99]">
          <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-white"><Calculator className="size-[18px]" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#1d1d1f]">Earnings Calculator</span><span className="mt-0.5 block text-xs text-[#51769b]">Estimate a payout from your actual analytics.</span></span>
          <span className="text-sm font-semibold">{calculatorOpen ? 'Hide' : 'Open'}</span>
        </button>
        {calculatorOpen ? <div className="mt-4"><CreatorPayoutCalculator /></div> : null}

        <div className="mt-5 grid gap-2">
          <GuideDisclosure title="View milestones" meta="6 thresholds">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{payoutThresholds.map((threshold) => <span key={threshold} className="rounded-[12px] bg-[#f5f5f7] px-2 py-3 text-center text-sm font-semibold">{threshold}</span>)}</div>
            <p className="mt-3 text-xs leading-5 text-[#6e6e73]">Milestones are cumulative totals, not stacked bonuses. The view count verified during review becomes the payout snapshot.</p>
          </GuideDisclosure>
          <GuideDisclosure title="Eligible Tier-1 countries" meta={`${tierOneCountries.length} countries`}>
            <div className="flex flex-wrap gap-2">{tierOneCountries.map((country) => <span key={country} className="rounded-full bg-[#f5f5f7] px-3 py-1.5 text-xs font-medium text-[#6e6e73]">{country}</span>)}</div>
            <p className="mt-3 text-xs leading-5 text-[#6e6e73]">Any mix of these countries may satisfy the 20% base requirement. Enhanced rates require the United States alone to reach at least 22.5%.</p>
          </GuideDisclosure>
        </div>
      </div>

      <div className="flex items-start gap-3 border-t border-black/[0.055] bg-[#f5f5f7]/70 p-5 sm:p-6"><LockKeyhole className="mt-0.5 size-5 shrink-0 text-[#0071e3]" /><div><p className="text-sm font-semibold">Add a payout destination before funds are released.</p><p className="mt-1 text-xs leading-5 text-[#6e6e73]">You may submit content before choosing PayPal or crypto. The destination only needs to be ready before payment is processed.</p></div></div>
    </section>
  )
}

function GuidePanelHeader({ icon: Icon, eyebrow, title, description, action }: { icon: typeof FileVideo2; eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 border-b border-black/[0.055] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-[15px] bg-[#e8f2ff] text-[#0071e3]"><Icon className="size-5" /></span><div><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#86868b]">{eyebrow}</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#6e6e73]">{description}</p></div></div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

function GuideDisclosure({ title, meta, children, tone = 'default' }: { title: string; meta: string; children: ReactNode; tone?: 'default' | 'warning' }) {
  return (
    <details className={cn('guide-disclosure rounded-[16px] border bg-white', tone === 'warning' ? 'border-[#f2d78a]' : 'border-black/[0.07]')}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 text-sm font-semibold marker:content-none">
        {tone === 'warning' ? <TriangleAlert className="size-4 shrink-0 text-[#8a5a00]" /> : <Check className="size-4 shrink-0 text-[#248a3d]" />}
        <span className="min-w-0 flex-1">{title}</span>
        <span className="text-[11px] font-normal text-[#86868b]">{meta}</span>
        <ChevronDown className="guide-disclosure-chevron size-4 shrink-0 text-[#86868b]" />
      </summary>
      <div className="border-t border-black/[0.055] px-4 py-4">{children}</div>
    </details>
  )
}

function Checklist({ items, warning = false }: { items: ReadonlyArray<string>; warning?: boolean }) {
  return <ul className="grid gap-3 sm:grid-cols-2">{items.map((item) => <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-[#6e6e73]">{warning ? <TriangleAlert className="mt-1 size-4 shrink-0 text-[#8a5a00]" /> : <Check className="mt-1 size-4 shrink-0 text-[#248a3d]" />}<span>{item}</span></li>)}</ul>
}

function Evidence({ icon: Icon, title, detail }: { icon: typeof Smartphone; title: string; detail: string }) {
  return <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-white text-[#0071e3] shadow-sm"><Icon className="size-4" /></span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-[#6e6e73]">{detail}</p></div></div>
}

function AccountStep({ number, icon: Icon, title, detail }: { number: string; icon: typeof Link2; title: string; detail: string }) {
  return <li className="rounded-[16px] bg-[#f5f5f7] p-4"><div className="flex items-center justify-between"><span className="grid size-9 place-items-center rounded-[12px] bg-white text-[#0071e3] shadow-sm"><Icon className="size-4" /></span><span className="text-[10px] font-semibold text-[#aeaeb2]">{number.padStart(2, '0')}</span></div><p className="mt-4 text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-[#6e6e73]">{detail}</p></li>
}

function StatusRow({ label, detail, tone }: { label: string; detail: string; tone: 'danger' | 'warning' | 'success' }) {
  const classes = tone === 'success' ? 'bg-[#e5f7ea] text-[#248a3d]' : tone === 'warning' ? 'bg-[#fff4ce] text-[#8a5a00]' : 'bg-[#ffebea] text-[#d70015]'
  return <div className="rounded-[14px] bg-[#f5f5f7] p-3"><span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', classes)}>{label}</span><p className="mt-2 text-xs leading-5 text-[#6e6e73]">{detail}</p></div>
}

function PayoutFact({ value, label }: { value: string; label: string }) {
  return <div className="rounded-[16px] bg-[#f5f5f7] p-5"><p className="text-2xl font-semibold tabular-nums tracking-[-0.045em]">{value}</p><p className="mt-2 text-xs leading-5 text-[#6e6e73]">{label}</p></div>
}
