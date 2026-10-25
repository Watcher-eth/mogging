import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdminPayoutDecision } from './creator-workspace'
import type { AdminSubmission } from './creator-types'
import { defaultCreatorSprintTerms } from '@/lib/creator/sprint-defaults'

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
