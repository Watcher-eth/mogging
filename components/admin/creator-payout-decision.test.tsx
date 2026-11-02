import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdminPayoutDecision } from './creator-workspace'
import type { AdminSubmission } from './creator-types'
import { defaultCreatorSprintTerms } from '@/lib/creator/sprint-defaults'
import { SubmissionAudienceCheck } from './submission-audience-check'

const submission = { sprintTerms: defaultCreatorSprintTerms(), viewCountThreshold: 20000, usAudiencePercent: 20.7 } as AdminSubmission

test('verified metrics preserve empty and decimal editing text instead of coercing each keystroke', () => {
  for (const selection of [
    { viewCountThreshold: '', usAudiencePercent: '' },
    { viewCountThreshold: '32000', usAudiencePercent: '20.' },
    { viewCountThreshold: '32000', usAudiencePercent: '20.70' },
  ]) {
    const html = renderToStaticMarkup(<AdminPayoutDecision submission={submission} selection={selection} onViewCountChange={() => {}} onAudienceChange={() => {}} />)
    expect(html).toContain(`value="${selection.viewCountThreshold}"`)
    expect(html).toContain(`value="${selection.usAudiencePercent}"`)
    expect(html).not.toContain('disabled')
  }
})

test('automatic audience values are read-only until the reviewer chooses an override', () => {
  const html = renderToStaticMarkup(<AdminPayoutDecision submission={submission} audienceReadOnly selection={{ viewCountThreshold: '32000', usAudiencePercent: '60' }} onViewCountChange={() => {}} onAudienceChange={() => {}} />)
  expect(html).toContain('readOnly=""')
  const pending = renderToStaticMarkup(<SubmissionAudienceCheck check={{ version: 1, storageKey: 'key', status: 'needs_review', reason: 'Country percentages were unreadable.' }} manual confirmed={false} onManualChange={() => {}} onConfirmedChange={() => {}} />)
  expect(pending).toContain('Audience needs manual review')
  expect(pending).toContain('Country percentages were unreadable.')
  expect(pending).toContain('I checked the recording and confirmed the audience percentage.')
})
