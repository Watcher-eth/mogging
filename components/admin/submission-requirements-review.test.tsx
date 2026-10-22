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
