import { CAMPAIGN_ANCHOR_REQUIREMENT, CAMPAIGN_BIO_LINK_REQUIREMENT } from '@/lib/creator/campaign-publishing-policy'
import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { SubmissionRequirementsReview } from './submission-requirements-review'

const items = [
  { id: 'hook', label: 'Strong opening hook', detail: 'Hook appears in the first three seconds.', met: false, note: null },
  { id: 'cta', label: 'Clear CTA', detail: 'The video closes with the required CTA.', met: true, note: null },
]

test('approval review includes the check-all action', () => {
  const html = renderToStaticMarkup(<SubmissionRequirementsReview items={items} status="in_review" onChange={() => {}} />)
  expect(html).toContain('>Check all</button>')
  expect(html).toContain('>1/2</span>')
})

test('rejection review keeps failure reasons individually selected', () => {
  const html = renderToStaticMarkup(<SubmissionRequirementsReview items={items} status="rejected" onChange={() => {}} />)
  expect(html).not.toContain('>Check all</button>')
  expect(html).toContain('>1 selected</span>')
})

test('specialist criteria appear first without duplicating or resetting checklist results', () => {
  const specialist = [
    { id: 'element-1', label: 'A Mogging mock report is shown', detail: 'Show the report.', met: false, note: 'Report missing' },
    { id: 'requirement-1', label: 'Tag Mogging', detail: 'Caption tag', met: true, note: null },
  ]
  const html = renderToStaticMarkup(<SubmissionRequirementsReview items={specialist} campaignName="Mogging Detailed Analysis" status="rejected" onChange={() => {}} />)
  expect(html).toContain('Mogging Detailed Analysis criteria')
  expect(html).toContain('General requirements &amp; rules')
  expect(html.indexOf('Mogging Detailed Analysis criteria')).toBeLessThan(html.indexOf('General requirements &amp; rules'))
  expect(html).toContain('Not met: A Mogging mock report is shown')
  expect(html).toContain('Report missing')
  expect(html.match(/Not met: A Mogging mock report is shown/g)?.length).toBe(1)
})


test('publishing rules remain visible and checkable during the grace period, without becoming rejection reasons', () => {
  const publishingItems = [
    { id: 'publishing-anchor', label: CAMPAIGN_ANCHOR_REQUIREMENT, detail: 'Anchor requirement', met: false, note: null, waived: true },
    { id: 'publishing-bio-link', label: CAMPAIGN_BIO_LINK_REQUIREMENT, detail: 'Bio-link requirement', met: true, note: null, waived: true },
  ]
  const approved = renderToStaticMarkup(<SubmissionRequirementsReview items={publishingItems} status="approved" onChange={() => {}} />)
  expect(approved).toContain(CAMPAIGN_ANCHOR_REQUIREMENT)
  expect(approved).toContain(CAMPAIGN_BIO_LINK_REQUIREMENT)
  expect(approved).toContain('Grace period applies')
  expect(approved).not.toContain('disabled=""')
  const rejected = renderToStaticMarkup(<SubmissionRequirementsReview items={publishingItems} status="rejected" onChange={() => {}} />)
  expect(rejected).toContain('>0 selected</span>')
  expect(rejected.match(/disabled=""/g)).toHaveLength(2)
  expect(rejected).not.toContain('Not met:')
})
