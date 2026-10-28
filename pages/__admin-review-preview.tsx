import { detailedAnalysisVariantTerms } from '@/lib/creator/detailed-analysis-variant'
import { submissionHistory } from '@/lib/admin/submission-history'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { ReviewDialog } from '@/components/admin/creator-workspace'
import type { AdminSubmission, AdminPayment } from '@/components/admin/creator-types'
import { launchCampaignTerms, LAUNCH_CAMPAIGNS } from '@/lib/creator/campaign-launch'

const terms = launchCampaignTerms(LAUNCH_CAMPAIGNS.find(campaign => campaign.name === 'General Looksmaxxing Content') || LAUNCH_CAMPAIGNS[0])
const submission: AdminSubmission = {
  id: '00000000-0000-4000-8000-000000000015', creatorProfileId: 'preview', creatorName: 'Preview creator', creatorEmail: 'preview@example.invalid',
  socialAccountId: null, socialHandle: 'preview', socialAccountStatus: null, formatId: terms.formats[0].id, requirementsConfirmedAt: null,
  title: '$15 paid rereview · no additional payment', platform: 'tiktok', caption: null, postUrl: null, videoUrl: null, videoContentType: null, videoSizeBytes: null,
  analyticsScreenshotUrl: null, analyticsContentType: null, analyticsSizeBytes: null, viewCountThreshold: 47100, usAudiencePercent: 57.8,
  adminViewCountThreshold: 38600, adminUsAudiencePercent: 51, status: 'in_review', reviewRequestedAt: '2026-10-23T13:22:00Z', approvedAmountCents: 1500,
  reviewNote: null, reviewChecklist: null, createdAt: '2026-10-22T12:00:00Z', sprintId: 'preview-campaign', sprintName: 'General Looksmaxxing Content', sprintTerms: terms,
}
const payments: AdminPayment[] = [{ id: 'preview-payment', creatorProfileId: 'preview', creatorName: 'Preview creator', creatorEmail: 'preview@example.invalid', submissionId: submission.id, submissionTitle: submission.title, amountCents: 1500, currency: 'USD', status: 'paid', paymentOption: 'paypal', providerReference: null, paidAt: submission.createdAt, createdAt: submission.createdAt }]
export default function AdminReviewPreview() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [saved, setSaved] = useState('')
  useEffect(() => {
    const original = window.fetch
    window.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/admin/creator/review') {
        const body = JSON.parse(String(init?.body || '{}'))
        if (body.id === submission.id) { setSaved(JSON.stringify(body)); return Response.json({ data: { ok: true } }) }
      }
      if (url.includes(`/submissions/${submission.id}/history`)) return Response.json({ data: {hasLegacyEvents:false, entries:submissionHistory(submission, [
        {id:'submitted',type:'submitted',note:null,createdAt:submission.createdAt,historySnapshot:{submittedViews:20000,submittedAudiencePercent:42,verifiedViews:null,verifiedAudiencePercent:null,approvedAmountCents:null,campaignId:'preview',campaignName:'General Looksmaxxing Content'}},
        {id:'approved',type:'approved',note:'Original post approved.',createdAt:'2026-10-22T14:00:00Z',historySnapshot:{submittedViews:20000,submittedAudiencePercent:42,verifiedViews:20000,verifiedAudiencePercent:40,approvedAmountCents:1500,campaignId:'preview',campaignName:'General Looksmaxxing Content'}},
        {id:'rereview',type:'rereview_requested',note:null,createdAt:submission.reviewRequestedAt!,historySnapshot:{submittedViews:47100,submittedAudiencePercent:57.8,verifiedViews:20000,verifiedAudiencePercent:40,approvedAmountCents:1500,campaignId:'preview',campaignName:'General Looksmaxxing Content'}},
      ],[],payments.map(p=>({...p,paidAt:'2026-10-22T18:00:00Z'}))) } })
      if (url.includes(`/submissions/${submission.id}/messages`)) return Response.json({ data: { submission: { status: 'in_review', unreadMessages: 0 }, messages: [], nextCursor: null } })
      return original(input, init)
    }, original)
    setReady(true)
    return () => { window.fetch = original }
  }, [])
  if (['mobile', 'compact'].includes(String(router.query.device))) return <iframe title="Mobile review preview" src="/__admin-review-preview" style={{ width: 390, height: router.query.device === 'compact' ? 360 : 640, border: 0 }} />
  const detailedCase = ['mgc', 'detailed'].includes(String(router.query.case))
  const detailed = launchCampaignTerms(LAUNCH_CAMPAIGNS.find(campaign => campaign.key === 'detailed-analysis')!)
  const versionTerms = router.query.case === 'mgc' ? detailedAnalysisVariantTerms(detailed, 'bd0d7a74-3c39-44dd-98ec-21bf6667a714') : detailed
  const reviewSubmission = detailedCase ? { ...submission, title: 'Detailed analysis · 100K views', sprintName: router.query.case === 'mgc' ? 'Mogging Detailed Analysis MGC' : 'Mogging Detailed Analysis', sprintTerms: versionTerms, formatId: versionTerms.formats[0].id, status: 'pending' as const, approvedAmountCents: null, reviewRequestedAt: null, viewCountThreshold: 100000, usAudiencePercent: 32, adminViewCountThreshold: null, adminUsAudiencePercent: null } : router.query.case === 'bonus' ? { ...submission, title: '100K views · 62% Tier 1 audience', status: 'pending' as const, approvedAmountCents: null, reviewRequestedAt: null, viewCountThreshold: 100000, usAudiencePercent: 62, adminViewCountThreshold: null, adminUsAudiencePercent: null } : submission
  return <main className="p-8"><p>Local sample only. No production writes.</p><output aria-label="Saved review payload">{saved}</output>{ready ? <ReviewDialog target={{ resource: 'submission', item: reviewSubmission }} payments={detailedCase || router.query.case === 'bonus' ? [] : payments} metrics={[]} open onOpenChange={() => {}} onRefresh={async () => {}} onSaved={async () => {}} /> : null}</main>
}
export function getServerSideProps() { return process.env.NODE_ENV === 'production' ? { notFound: true } : { props: {} } }
