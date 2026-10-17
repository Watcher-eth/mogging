import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { PayoutVideoBreakdown } from './bundled-payout-queue'
import type { AdminDashboard, AdminPayment, AdminSubmission } from './creator-types'

test('bundle breakdown distinguishes a new video from the unpaid increase on a previously paid video', () => {
  const data = {
    submissions: [{id:'old',title:'Milestone video',platform:'tiktok',socialHandle:'creator',sprintId:'campaign',approvedAmountCents:3500}, {id:'new',title:'New video',platform:'instagram',sprintId:'campaign',approvedAmountCents:1500}] as AdminSubmission[],
    payments: [{id:'paid',submissionId:'old',amountCents:1500,status:'paid'}, {id:'reserved',submissionId:'old',amountCents:2000,status:'processing',payoutRequestId:'bundle'}] as AdminPayment[],
  } as AdminDashboard
  const html = renderToStaticMarkup(<PayoutVideoBreakdown data={data} requestId="bundle" lines={[{submissionId:'old',amountCents:2000},{submissionId:'new',amountCents:1500}]} />)
  expect(html).toContain('Rereview')
  expect(html).toContain('New submission')
  expect(html).toContain('$15 already paid')
  expect(html).toContain('$20')
  expect(html).not.toContain('processing separately')
})
