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
