import { selectSupportArtifacts } from '@/lib/creator/support/presentation'
import Image from 'next/image'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ArrowUpRight, Check, Copy, Share2, ChartNoAxesCombined, Files,  Megaphone, SquarePen, ChevronLeft, ChevronRight, X, ArrowDown, Wallet, Link2, BookOpen, ClipboardList, Video, Lightbulb, Users, CreditCard, CirclePlus } from 'lucide-react'
import useSWR from 'swr'
import { SUPPORT_DAILY_MESSAGES, type SupportAllowance } from '@/lib/creator/support/allowance'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SubmissionCard } from '@/components/creator/submission-card'
import { destinations, type SupportArtifact, type SupportDestination, type SupportResponse } from '@/lib/creator/support/contracts'
import { LAUNCH_CAMPAIGNS, launchCampaign } from '@/lib/creator/campaign-launch'
import { bonusPaymentStatus } from '@/lib/creator/bonus-payments'
import { sprintMoney } from '@/lib/creator/sprints'
import type { CreatorSubmission } from '@/components/creator/types'
import { Message, MessageContent, MessageActions, MessageAction } from '@/components/prompt-kit/message'
import { PromptInput, PromptInputTextarea, PromptInputActions, PromptInputAction } from '@/components/prompt-kit/prompt-input'
import { PromptSuggestion } from '@/components/prompt-kit/prompt-suggestion'
import { useReducedMotion } from 'motion/react'
import { AnimatedGroup } from '@/components/core/animated-group'
import { TextShimmer } from '@/components/core/text-shimmer'
import { SUPPORT_NAME } from '@/lib/creator/support/identity'
import { SupportContentRequirements } from './content-requirements'
import { SubmissionViewsChart } from './submission-views-chart'
import { SupportResponseText } from './response-text'
import styles from './support-chat.module.css' 

const CampaignContextCard = dynamic(() => import('./campaign-context').then(m => m.SupportCampaignContext))
const SubmissionEvidenceCard = dynamic(() => import('./campaign-context').then(m => m.SupportSubmissionEvidence))
const ExampleCarousel = dynamic(() => import('@/components/creator/campaign-examples').then(m => m.ExampleCarousel), { loading: () => <p className="p-4 text-xs text-zinc-500">Opening campaign examples…</p> })
const VideoAnalyticsCard = dynamic(() => import('./video-analytics-card').then(m => m.SupportVideoAnalyticsCard))
const AnalyticsCard = dynamic(() => import('./analytics-card').then(m => m.SupportAnalyticsCard), { loading: () => <p className="p-5 text-xs text-zinc-500">Loading your chart…</p> })
const SubmissionDialog = dynamic(() => import('@/components/creator/submission-dialog').then(m => m.SubmissionDialog))
type ChatMessage = { id: string; role: 'user'; text: string; requestText: string } | ({ id: string; role: 'assistant' } & SupportResponse)
const prompts = [
  { image: 'submissions', label: 'My submissions', detail: 'Reviews, decisions & earnings', message: 'Show my submissions' },
  { image: 'analytics', label: 'My analytics', detail: 'See how your content is doing', message: 'Show my analytics for the last 30 days' },
  { image: 'cta', label: 'Create a CTA', detail: 'Find the words for your next post', message: 'Help me create a CTA' },
  { image: 'rewards', label: 'Bonuses & rewards', detail: 'Keep track of what you’ve earned', message: 'Show my bonuses' },
]
export function CreatorSupportChat(props: { demo?: boolean; compact?: boolean; onClose?: () => void }) {
  const { data: session } = useSession()
  return <SupportChatSession ownerKey={props.demo ? 'sample' : session?.user?.id ?? 'anonymous'} key={props.demo ? 'sample' : session?.user?.id ?? 'anonymous'} {...props} />
}
function SupportChatSession({ demo = false, compact = false, onClose, ownerKey }: { demo?: boolean; compact?: boolean; onClose?: () => void; ownerKey: string }) {
  const router = useRouter()
  const endpoint = demo ? '/api/creator/support-demo' : '/api/creator/support'
  const { data: allowance, mutate: updateAllowance } = useSWR<SupportAllowance>([endpoint, ownerKey], ([url]: [string, string]) => apiGet<SupportAllowance>(url), { refreshInterval: 60_000 })
  const dailyLimitReached = allowance?.remaining === 0 && Date.parse(allowance.resetsAt) > Date.now()
  const reducedMotion = useReducedMotion()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [awayFromBottom, setAwayFromBottom] = useState(false)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversation, setConversation] = useState<string>()
  const [newSubmission, setNewSubmission] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const followBottom = useRef(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => {
    const observer = new ResizeObserver(() => { if (followBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight })
    if (content.current) observer.observe(content.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { if (messages.length && followBottom.current) scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'instant' as ScrollBehavior }) }, [messages, pending])
  async function send(text: string) {
    if (!text.trim() || pending || dailyLimitReached) return
    const controller = new AbortController(); abort.current = controller; followBottom.current = true
    setMessages(current => [...current, { id: crypto.randomUUID(), role: 'user', text: displaySupportRequest(text.trim()), requestText: text.trim() }]); setDraft(''); setPending(true); setError(null)
    try {
      const result = await apiPost<SupportResponse>(endpoint, { message: text.trim(), conversation }, { signal: controller.signal })
      if (result.allowance) void updateAllowance(result.allowance, false)
      setMessages(current => [...current, { ...result, id: crypto.randomUUID(), role: 'assistant' }]); setConversation(result.conversation)
    } catch (cause) { if (cause instanceof ApiClientError && cause.status === 429) { const details = cause.details as { allowance?: SupportAllowance } | undefined; if (details?.allowance) void updateAllowance(details.allowance, false) } else void updateAllowance(); if (cause instanceof ApiClientError && cause.status === 400 && cause.message.includes('expired')) setConversation(undefined); if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not send your message. Please try again.') }
    finally { if (abort.current === controller) { setPending(false); abort.current = null; inputRef.current?.focus() } }
  }
  function reset() { followBottom.current = false; abort.current?.abort(); abort.current = null; setPending(false); setMessages([]); setConversation(undefined); setError(null); setDraft(''); setAwayFromBottom(false); inputRef.current?.focus() }
  function openDestination(destination: SupportDestination) { if (demo) void router.push(destinations[destination].href); else setNewSubmission(true) }
  function openCampaign(id: string) { void router.push(`/creator/sprints?id=${encodeURIComponent(id)}`) }
  function openSubmission(submission: CreatorSubmission | string) { void router.push(`/creator/submissions?submission=${encodeURIComponent(typeof submission === 'string' ? submission : submission.id)}`) }
  return <div className={`${styles.chat} ${compact ? styles.compact : ''}`}>
    <header className={styles.header}>
      <div className={styles.headerLeading}>{onClose ? <button type="button" onClick={onClose} className={styles.iconButton} aria-label="Close Mogging Support"><ChevronLeft size={22} /></button> : <Link href="/creator" className={styles.iconButton} aria-label="Back to Creator Studio"><ChevronLeft size={22} /></Link>}</div>
      <div className={styles.identity}><span className={styles.avatar}><Image src="/creator/support/avatar.png" alt="" width={48} height={48} priority /></span><h2>{SUPPORT_NAME}<ChevronRight size={10} aria-hidden="true" /></h2><p>Creator assistant</p></div>
      <div className={styles.headerActions}><button type="button" onClick={reset} className={styles.iconButton} aria-label="Start a new chat" title="New chat"><SquarePen size={19} /></button></div>
    </header>
    {demo ? <div className={styles.demoNote}><span>LOCAL DEMO</span>Sample creator data</div> : null}
    <div className={styles.conversationFrame}><div className={styles.messages} ref={scroll} onScroll={e => { const el = e.currentTarget; setAwayFromBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 120) }} onWheel={event => { if (event.deltaY < 0) followBottom.current = false; else if (scroll.current && scroll.current.scrollHeight - scroll.current.scrollTop - scroll.current.clientHeight < 100) followBottom.current = true }} onTouchMove={() => { followBottom.current = false }} role="log" aria-label="Mogging Support conversation" aria-live="polite" aria-relevant="additions">
      <div ref={content} className={styles.conversationContent}>
      {!messages.length ? <div className={styles.welcome}>
        <AnimatedGroup className={styles.welcomeIntro}>
          <div className={styles.welcomeMark}><Image src="/creator/support/avatar.png" width={64} height={64} alt="" /></div>
          <h1>A little help.<br /><span>For what’s next.</span></h1>
          <p className={styles.intro}>Clear answers about your posts, campaigns, and earnings.</p>
        </AnimatedGroup>
        <AnimatedGroup className={styles.prompts}>{prompts.map(item => <PromptSuggestion className="creator-surface" data-creator-card key={item.label} type="button" onClick={() => void send(item.message)}><span className={styles.promptIcon}><Image src={`/creator/support/${item.image}.png`} alt="" width={48} height={48} /></span><span><strong>{item.label}</strong><small>{item.detail}</small></span><ArrowUpRight size={14} /></PromptSuggestion>)}</AnimatedGroup>
      </div> : messages.map(message => message.role === 'user' ? <Message className={styles.user} key={message.id}><MessageContent className={styles.userBubble}>{message.text}</MessageContent></Message> : <AnimatedGroup key={message.id} className={styles.responseEntry}><Message className={styles.assistant}>
        <span className={styles.messageAvatar}><Image src="/creator/support/avatar.png" alt="" width={28} height={28} /></span>
        <div className={styles.answer}>
          <div className={styles.answerLabel}>{SUPPORT_NAME}</div>
          <MessageContent className={styles.answerProse}>{message.text.split(/\n\s*\n/).map((paragraph, i) => <p key={i} className={styles.answerText}><SupportResponseText text={paragraph} /></p>)}</MessageContent>
          <ArtifactList question={messages.slice(0, messages.indexOf(message)).findLast(m => m.role === 'user')?.text ?? ''} artifacts={message.artifacts} onDestination={openDestination} onSubmission={openSubmission} onCampaign={openCampaign} onExplain={text => void send(text)} />
          <ResponseActions text={message.text} artifacts={message.artifacts} onDestination={openDestination} />

        </div>
      </Message></AnimatedGroup>)}
      {pending ? <div className={styles.pending} role="status"><span className={styles.pendingMark}><Image src="/creator/support/avatar.png" width={28} height={28} alt="" /></span><span className={styles.pendingText}>{reducedMotion ? 'Looking into that for you…' : <TextShimmer as="span" duration={1.6}>Looking into that for you…</TextShimmer>}</span></div> : null}
      </div>
    </div>
      {awayFromBottom ? <button type="button" className={styles.scrollLatest} aria-label="Scroll to latest message" onClick={() => { followBottom.current = true; scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'instant' as ScrollBehavior }) }}><ArrowDown size={15} /></button> : null}
    </div>
    <div className={styles.composerArea}>
      {error ? <p className={styles.error} role="alert">{error}{!dailyLimitReached ? <button type="button" onClick={() => { const last = [...messages].reverse().find(m => m.role === 'user'); if (last) void send(last.requestText) }}>Try again</button> : null}</p> : null}

      <PromptInput className={styles.composer} value={draft} onValueChange={setDraft} onSubmit={() => void send(draft)} isLoading={pending} maxHeight={140}>
        <PromptInputTextarea ref={inputRef} maxLength={1500} disabled={dailyLimitReached} placeholder={compact ? 'Message…' : 'Message Mogging Support…'} aria-label="Message Mogging Support" />
        <PromptInputActions className={styles.composerToolbar}>
          <span className={styles.allowance} role="status">{dailyLimitReached ? 'Daily limit reached · resets at 00:00 UTC' : allowance ? `${allowance.remaining} of ${SUPPORT_DAILY_MESSAGES} messages left today` : `${SUPPORT_DAILY_MESSAGES} messages per day`}</span>
          <PromptInputAction tooltip={pending ? 'Stop response' : 'Send message'}>
            <button className={styles.send} type="button" disabled={!pending && (!draft.trim() || dailyLimitReached)} aria-label={pending ? 'Stop response' : 'Send message'} onClick={() => { if (pending) { abort.current?.abort(); setPending(false) } else void send(draft) }}>{pending ? <X size={17} /> : <ArrowUp size={18} />}</button>
          </PromptInputAction>
        </PromptInputActions>
      </PromptInput>
    </div>
    {newSubmission ? <SubmissionDialog open onOpenChange={setNewSubmission} onSubmitted={async () => { setNewSubmission(false); void send('Show my submissions') }} /> : null}

  </div>
}

const destinationIcons = { campaigns: Megaphone, submissions: Files, 'new-submission': CirclePlus, accounts: Link2, money: Wallet, conversions: ChartNoAxesCombined, cta: Megaphone, start: BookOpen, rules: ClipboardList, video: Video, improve: Lightbulb, referrals: Users, 'payout-information': CreditCard } satisfies Record<SupportDestination, typeof Files>
function PortalAction({ destination, onDestination }: { destination: SupportDestination; onDestination: (destination: SupportDestination) => void }) {
  const Icon = destinationIcons[destination]
  const content = <><Icon size={14} aria-hidden="true" />{destinations[destination].label}<ArrowUpRight size={12} aria-hidden="true" /></>
  return destination === 'new-submission'
    ? <button type="button" onClick={() => onDestination(destination)}>{content}</button>
    : <Link href={destinations[destination].href}>{content}</Link>
}

function ResponseActions({ text, artifacts, onDestination }: { text: string; artifacts: SupportArtifact[]; onDestination: (destination: SupportDestination) => void }) {
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const [copyError, setCopyError] = useState(false)
  async function copy() { try { await navigator.clipboard.writeText(text); setCopied(true); setCopyError(false) } catch { setCopyError(true) } }
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: SUPPORT_NAME, text })
      else { await navigator.clipboard.writeText(text); setShared(true) }
      setCopyError(false)
    } catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) setCopyError(true) }
  }
  return <MessageActions className={styles.responseActions}>
    <div className={styles.actions}>{artifacts.flatMap((a,index) => a.type === 'action' ? [<PortalAction key={index} destination={a.destination} onDestination={onDestination} />] : [])}</div>
    <div className={styles.responseIconGroup}>
      <MessageAction tooltip={copied ? 'Copied' : 'Copy response'}><button className={styles.responseIcon} type="button" onClick={() => void copy()} aria-label={copied ? 'Response copied' : 'Copy response'}>{copied ? <Check size={14} /> : <Copy size={14} />}</button></MessageAction>
      <MessageAction tooltip={shared ? 'Copied for sharing' : 'Share response'}><button className={styles.responseIcon} type="button" onClick={() => void share()} aria-label={shared ? 'Response copied for sharing' : 'Share response'}>{shared ? <Check size={14} /> : <Share2 size={14} />}</button></MessageAction>
    </div>
    {copyError ? <span role="status">Select the answer to copy or share it.</span> : null}
  </MessageActions>
}

function displaySupportRequest(text: string) {
  if (/^Show conversions for my submission [a-zA-Z0-9_-]+/.test(text)) return 'Show this video’s conversions for the selected period'
  if (/^Explain the recorded decision and earnings for my submission [a-zA-Z0-9_-]+$/.test(text)) return 'Explain this submission’s decision and earnings'
  if (/^Show video examples from the campaign for my submission [a-zA-Z0-9_-]+$/.test(text)) return 'Show examples from this submission’s campaign'
  if (/^Create a truthful CTA for campaign [a-zA-Z0-9_-]+, using its creative brief$/.test(text)) return 'Create a CTA using this campaign’s creative brief'
  return text
}

function ArtifactList({ question, artifacts: allArtifacts, onDestination, onSubmission, onCampaign, onExplain }: { question: string; artifacts: SupportArtifact[]; onDestination: (destination: SupportDestination) => void; onSubmission: (submission: CreatorSubmission | string) => void; onCampaign: (id: string) => void; onExplain: (message: string) => void }) {
  const artifacts = selectSupportArtifacts(question, allArtifacts)
  const hasCampaignRules = artifacts.some(a => a.type === 'submission-detail' && a.detail.context || a.type === 'campaign-detail' && a.view !== 'milestones')
  const guidance = artifacts.find(a => a.type === 'action' && (a.destination === 'video' || a.destination === 'rules'))
  return <div className={styles.artifacts}>{!hasCampaignRules && guidance?.type === 'action' ? <SupportContentRequirements question={question} rulesOnly={guidance.destination === 'rules'} /> : null}{artifacts.filter(a => a.type !== 'action').map((artifact, index) => {
    if (artifact.type === 'submission-views') return <SubmissionViewsChart key={index} rows={artifact.rows} scope={artifact.scope} onOpen={onSubmission} />
    if (artifact.type === 'video-analytics') return <VideoAnalyticsCard key={index} artifact={artifact} onExplain={onExplain} />
    if (artifact.type === 'analytics') return <AnalyticsCard key={index} artifact={artifact} />
    if (artifact.type === 'submissions') return <section key={index} aria-label="Your submissions"><div className={styles.cardHeader}><span>Your submissions</span><span>{artifact.submissions.length} shown · {artifact.total} total</span></div><TooltipProvider delayDuration={150}>{(artifact.groups ?? [{ key: 'all', title: 'Matching submissions', total: artifact.total, submissions: artifact.submissions }]).map(group => <section key={group.key} className={styles.submissionGroup} aria-label={group.title}><h3>{group.title}<span>{group.total}</span></h3><div className={styles.submissions}>{group.submissions.map(submission => <div key={submission.id}><SubmissionCard className={styles.chatSubmission} submission={submission} bonuses={[]} onClick={() => onSubmission(submission)} /></div>)}</div>{!group.total ? <p className={styles.empty}>No submissions in this group.</p> : null}</section>)}</TooltipProvider></section>
    if (artifact.type === 'submission-detail') return <SubmissionEvidenceCard key={index} detail={artifact.detail} onCampaign={onCampaign} onExplain={onExplain} />
    if (artifact.type === 'campaign-detail') return <CampaignContextCard key={index} context={artifact.context} view={artifact.view} onCampaign={onCampaign} />
    if (artifact.type === 'campaign-examples') {
      const example = LAUNCH_CAMPAIGNS.find(c => c.key === artifact.exampleKey)
      return example && launchCampaign(artifact.campaign.terms)?.key === example.key ? <section key={index} className={styles.examplesInChat} aria-label={`${artifact.campaign.name} reference videos`}><p className={styles.caption}>Public references for {artifact.campaign.name}. These are inspiration, not your submissions or guaranteed approvals.</p><ExampleCarousel campaign={example} /><div className={styles.actions}><button type="button" onClick={() => onExplain(`Create a truthful CTA for campaign ${artifact.campaign.id}, using its creative brief`)}>Create a CTA for this campaign<ArrowUpRight size={12} /></button><button type="button" onClick={() => onCampaign(artifact.campaign.id)}>Open this campaign<ArrowUpRight size={12} /></button></div></section> : null
    }
    if (artifact.type === 'cta') return <CtaCard key={index} text={artifact.text} />
    if (artifact.type === 'campaigns') return <section key={index} aria-label="Campaigns" className={styles.campaigns}>{artifact.campaigns.map(c => <button key={c.id} type="button" onClick={() => onCampaign(c.id)}><span className={styles.campaignIcon}><Megaphone size={20} strokeWidth={1.5} /></span><span><strong>{c.name}</strong><small>{c.status === 'ended' || Date.parse(c.endsAt) < Date.now() ? 'Ended' : Date.parse(c.startsAt) > Date.now() ? 'Scheduled' : 'Published'} · {new Date(c.endsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small></span><ArrowUpRight size={16} /></button>)}{!artifact.campaigns.length ? <p className={styles.empty}>No visible campaigns found.</p> : null}</section>
    if (artifact.type === 'payments') return <section key={index} className={styles.ledger} aria-label="Your payment ledger"><div className={styles.cardHeader}><span>Recent payments</span><span>{artifact.payments.length} of {artifact.total}</span></div>{artifact.payments.map(p => <div className={styles.ledgerRow} key={p.id}><span><strong>{p.submissionId ? 'Content payment' : 'Creator reward'}</strong><small>{p.status === 'paid' ? `Paid${p.paidAt ? ` · ${new Date(p.paidAt).toLocaleDateString()}` : ''}` : p.status}</small></span><strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency }).format(p.amountCents / 100)}</strong></div>)}{!artifact.payments.length ? <p className={styles.empty}>No payments recorded yet.</p> : null}</section>
    if (artifact.type === 'bonuses') return <section key={index} className={styles.ledger} aria-label="Your bonus ledger"><div className={styles.cardHeader}><span>Recorded bonuses</span><span>{artifact.payments.length} of {artifact.total}</span></div>{artifact.payments.map(p => <div className={styles.ledgerRow} key={p.id}><span><strong>{p.bonusNote || 'Creator bonus'}</strong><small>{p.status === 'cancelled' ? 'Cancelled' : bonusPaymentStatus(p)}</small></span><strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency }).format(p.amountCents / 100)}</strong></div>)}{!artifact.payments.length ? <p className={styles.empty}>No recorded bonuses yet. Check campaign terms for available opportunities.</p> : null}</section>
    if (artifact.type === 'referrals') return <section key={index} className={styles.referrals} aria-label="Your referral summary"><Link2 size={20} strokeWidth={1.5} /><h3>Your creator referrals</h3><dl><div><dt>Invited</dt><dd>{artifact.report.invited}</dd></div><div><dt>Earned</dt><dd>{sprintMoney(artifact.report.earnedCents)}</dd></div><div><dt>Paid</dt><dd>{sprintMoney(artifact.report.paidCents)}</dd></div><div><dt>Outstanding</dt><dd>{sprintMoney(artifact.report.outstandingCents)}</dd></div></dl>{artifact.report.inviteUrl ? <InviteLink path={artifact.report.inviteUrl} /> : null}</section>
    return null
  })}</div>
}
function CtaCard({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  async function copy() { try { await navigator.clipboard.writeText(text); setCopied(true); setFailed(false) } catch { setFailed(true) } }
  return <section className={styles.cta} aria-label="Suggested creator CTA"><header><span><Megaphone size={14} />A starting point for your next post</span></header><blockquote>{text}</blockquote><footer className={styles.ctaFooter}><p>{failed ? 'Select the text above to copy it manually.' : 'Make it your own. Keep your claims truthful.'}</p><button onClick={() => void copy()} type="button" aria-label="Copy CTA">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}</button></footer></section>
}

function InviteLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  async function copy() { try { await navigator.clipboard.writeText(new URL(path, window.location.origin).href); setCopied(true) } catch { setError(true) } }
  return <div className="mt-4"><Button variant="outline" className="rounded-full text-xs" onClick={() => void copy()}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied invite link' : 'Copy creator invite link'}</Button>{error ? <Link className="ml-3 text-xs underline" href={path}>Open your invite link</Link> : null}</div>
}
