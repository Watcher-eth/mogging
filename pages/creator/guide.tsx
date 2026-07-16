import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpenText,
  Check,
  CircleDollarSign,
  Eye,
  FileVideo2,
  ImageIcon,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  UsersRound,
} from 'lucide-react'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import { Button } from '@/components/ui/button'
import { ACTIVE_CREATOR_SUBMISSION_FORMATS } from '@/lib/creator/formats'

const viewThresholds = ['40K', '100K', '250K', '500K', '750K', '+1M']
const audienceTiers = ['Default 20%', '22.5%', '25%', '27.5%', '30%', '32.5%', '35%', '37.5%', '40%']

export default function CreatorProgramGuidePage() {
  return (
    <CreatorShell>
      <CreatorHeader
        eyebrow="Creator Resources"
        title="Creator Program Guide"
        description="Use this guide before publishing to understand what the team reviews for account approval, video approval, and payment eligibility."
        action={<Button asChild className="h-10 rounded-xl"><Link href="/creator/submit">Submit a Video<ArrowRight /></Link></Button>}
      />

      <section className="grid gap-3 md:grid-cols-3">
        <GuideAnchor href="#video-requirements" icon={FileVideo2} number="01" title="Video & Format Requirements" description="Create the right post before you publish." />
        <GuideAnchor href="#account-analytics" icon={BarChart3} number="02" title="Account Analytics" description="Show the evidence needed for account review." />
        <GuideAnchor href="#audience-tiers" icon={UsersRound} number="03" title="Audience & Payment Tiers" description="Understand how qualified performance is verified." />
      </section>

      <GuideSection id="video-requirements" eyebrow="Section 01" title="Video & Format Requirements" description="Choose an active format before creating your post. Every submission is reviewed against the exact brief selected at submission.">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="space-y-4">
            {ACTIVE_CREATOR_SUBMISSION_FORMATS.map((format) => (
              <article key={format.id} className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Active Format</p><h3 className="mt-2 text-xl font-semibold tracking-[-0.035em]">{format.name}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">{format.shortDescription}</p></div>
                  <span className="w-fit rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Accepting Submissions</span>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {format.elements.map((element, index) => <div key={element.title} className="rounded-2xl bg-zinc-50 p-4"><p className="text-[10px] font-semibold tabular-nums text-zinc-300">{String(index + 1).padStart(2, '0')}</p><p className="mt-4 text-sm font-semibold">{element.title}</p><p className="mt-2 text-xs leading-5 text-zinc-500">{element.detail}</p></div>)}
                </div>
                <div className="mt-6 grid gap-6 sm:grid-cols-2">
                  <RequirementList title="Required" items={format.requirements} icon="check" />
                  <RequirementList title="Not Allowed" items={format.notAllowed} icon="alert" />
                </div>
              </article>
            ))}
          </div>
          <aside className="rounded-2xl border border-zinc-200 bg-zinc-950 p-5 text-white sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Submission Evidence</p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.035em]">What You Will Submit</h3>
            <div className="mt-6 space-y-5">
              <EvidenceItem icon={Smartphone} title="Published Post URL" description="A public TikTok or Instagram link is required. No video file upload is needed." />
              <EvidenceItem icon={ImageIcon} title="Video Analytics Screenshot" description="Upload a clear JPEG, PNG, or WebP screenshot showing the post’s performance and audience data." />
              <EvidenceItem icon={ShieldCheck} title="Final Confirmation" description="Confirm once that you checked every requirement for the selected format." />
            </div>
            <p className="mt-6 border-t border-white/10 pt-5 text-xs leading-5 text-white/45">Submit within 30 days of publishing. The post must remain public while it is being reviewed.</p>
          </aside>
        </div>
      </GuideSection>

      <GuideSection id="account-analytics" eyebrow="Section 02" title="Account Analytics" description="Account review confirms ownership and helps the team understand the audience behind your content.">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
            <div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-zinc-100"><BadgeCheck className="size-5" /></span><div><h3 className="text-lg font-semibold tracking-[-0.025em]">Connect, Verify, Then Review</h3><p className="mt-2 text-sm leading-6 text-zinc-500">You can add up to five TikTok and five Instagram accounts. Connect the profile first, then submit its analytics verification recording.</p></div></div>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <StatusExample label="Needs Verification" className="bg-red-50 text-red-700" description="Connected, but analytics evidence is still required" />
              <StatusExample label="Pending Review" className="bg-amber-50 text-amber-700" description="Verification recording submitted" />
              <StatusExample label="Approved" className="bg-emerald-50 text-emerald-700" description="Ready for verified posts" />
              <StatusExample label="Missing Information" className="bg-red-50 text-red-700" description="More evidence needed" />
            </div>
            <Button asChild variant="outline" className="mt-6 h-10 rounded-xl"><Link href="/creator/accounts">Manage Accounts<ArrowRight /></Link></Button>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Account Requirements</p>
            <h3 className="mt-2 text-lg font-semibold tracking-[-0.025em]">Show Recent, Verifiable Analytics</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-500">Use a second phone or camera to film your physical phone while navigating the platform’s analytics. The recording must be one continuous, unedited take.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <AnalyticsCheck title="Physical Recording" description="Your hand and main phone remain visible. Native screen recordings are not accepted." />
              <AnalyticsCheck title="Account Identity" description="The username remains visible and matches the connected account." />
              <AnalyticsCheck title="Recent Analytics" description="The most recent 28-day window, or the closest platform option, is visible." />
              <AnalyticsCheck title="Audience Geography" description="Open Locations and show the complete country or territory list." />
              <AnalyticsCheck title="One Continuous Take" description="No cuts, edits, hidden screens, or altered analytics are allowed." />
              <AnalyticsCheck title="Readable Evidence" description="Move slowly enough for every screen and value to be reviewed." />
            </div>
          </div>
        </div>
      </GuideSection>

      <GuideSection id="audience-tiers" eyebrow="Section 03" title="Targeted Audience Tiers for Payment" description="Declare the view threshold and audience tier shown in your post analytics. The review team verifies both before approving payment.">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
            <div className="flex items-start justify-between gap-5"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Qualified Performance</p><h3 className="mt-2 text-lg font-semibold tracking-[-0.025em]">View Count Thresholds</h3></div><Eye className="size-5 text-zinc-300" /></div>
            <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">{viewThresholds.map((threshold) => <span key={threshold} className="rounded-xl bg-zinc-100 px-2 py-3 text-center text-sm font-semibold">{threshold}</span>)}</div>
            <div className="mt-7 flex items-start justify-between gap-5"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Audience Quality</p><h3 className="mt-2 text-lg font-semibold tracking-[-0.025em]">Tier 1 Audience Options</h3></div><UsersRound className="size-5 text-zinc-300" /></div>
            <div className="mt-5 flex flex-wrap gap-2">{audienceTiers.map((tier, index) => <span key={tier} className={index === 0 ? 'rounded-full bg-black px-3 py-2 text-xs font-semibold text-white' : 'rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600'}>{tier}</span>)}</div>
            <p className="mt-5 text-xs leading-5 text-zinc-500">If no higher percentage is selected, the submission uses the Default 20% Tier 1 Audience. Higher tiers should be clearly supported by the uploaded analytics screenshot.</p>
          </div>
          <aside className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 p-5 sm:p-6">
            <span className="grid size-11 place-items-center rounded-2xl bg-white shadow-sm"><CircleDollarSign className="size-5" /></span>
            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Payment Schedule</p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.035em]">Payout Rates Coming Next</h3>
            <p className="mt-3 text-sm leading-6 text-zinc-500">This space is ready for the finalized payout table that maps verified view thresholds and audience tiers to creator compensation.</p>
            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-sm font-semibold">Before Funds Are Released</p><p className="mt-2 text-xs leading-5 text-zinc-500">Add a valid PayPal or crypto destination under Payout Information. You may submit content before completing this step.</p></div>
            <Button asChild variant="outline" className="mt-6 h-10 rounded-xl bg-white"><Link href="/creator/payout-information">Set Up Payouts<ArrowRight /></Link></Button>
          </aside>
        </div>
      </GuideSection>
    </CreatorShell>
  )
}

function GuideAnchor({ href, icon: Icon, number, title, description }: { href: string; icon: typeof BookOpenText; number: string; title: string; description: string }) {
  return <a href={href} className="group flex min-h-36 flex-col rounded-2xl border border-zinc-200 bg-white p-5 transition-[border-color,background-color,transform] duration-150 ease-out hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.995]"><div className="flex items-start justify-between gap-4"><span className="grid size-10 place-items-center rounded-xl bg-zinc-100"><Icon className="size-4" /></span><span className="text-[11px] font-semibold tabular-nums text-zinc-300">{number}</span></div><p className="mt-5 text-sm font-semibold">{title}</p><p className="mt-2 text-xs leading-5 text-zinc-500">{description}</p></a>
}

function GuideSection({ id, eyebrow, title, description, children }: { id: string; eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <section id={id} className="mt-12 scroll-mt-6"><div className="mb-5 max-w-2xl"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{eyebrow}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em] sm:text-3xl">{title}</h2><p className="mt-3 text-sm leading-6 text-zinc-500">{description}</p></div>{children}</section>
}

function RequirementList({ title, items, icon }: { title: string; items: ReadonlyArray<string>; icon: 'check' | 'alert' }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">{title}</p><ul className="mt-3 space-y-3">{items.map((item) => <li key={item} className="flex items-start gap-3 text-sm leading-6 text-zinc-600">{icon === 'check' ? <Check className="mt-1 size-4 shrink-0 text-emerald-600" /> : <TriangleAlert className="mt-1 size-4 shrink-0 text-amber-600" />}{item}</li>)}</ul></div>
}

function EvidenceItem({ icon: Icon, title, description }: { icon: typeof Smartphone; title: string; description: string }) {
  return <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10"><Icon className="size-4" /></span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-white/50">{description}</p></div></div>
}

function StatusExample({ label, className, description }: { label: string; className: string; description: string }) {
  return <div className="rounded-2xl bg-zinc-50 p-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}>{label}</span><p className="mt-2 text-[11px] leading-4 text-zinc-400">{description}</p></div>
}

function AnalyticsCheck({ title, description }: { title: string; description: string }) {
  return <div className="flex items-start gap-3 rounded-2xl bg-zinc-50 p-4"><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="size-3" /></span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p></div></div>
}
