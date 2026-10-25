import { expect, test } from 'bun:test'
import { creatorActivity, creatorUpdateAge, type CreatorUpdate } from './updates'
import type { CreatorSubmission, CreatorPayment } from '@/components/creator/types'

const post = { id: 'own', title: 'My video', caption: null, status: 'approved', reviewNote: null, createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-21T12:00:00Z', reviewRequestedAt: null } as CreatorSubmission
const approval: CreatorUpdate = { id: 'approval', submissionId: post.id, type: 'approved', title: post.title, note: 'Looks good', createdAt: '2026-10-21T12:00:00Z' }

test('approval remains in history when additional review is requested', () => {
  const request = '2026-10-22T12:00:00Z'
  const updates = creatorActivity([approval, { ...approval, id: 'request', type: 'rereview_requested', createdAt: request }], [{ ...post, status: 'in_review', reviewRequestedAt: request }], [])
  expect(updates.filter(item => item.type === 'approved')).toHaveLength(1)
  expect(updates.filter(item => item.type === 'rereview_requested')).toHaveLength(1)
  expect(updates[0].type).toBe('rereview_requested')
})

test('older current statuses are explicitly snapshots, not invented review events', () => {
  const updates = creatorActivity([], [post], [])
  expect(updates.find(item => item.type === 'approved')?.snapshot).toBe(true)
  expect(updates.find(item => item.type === 'submitted')?.createdAt).toBe(post.createdAt)
})

test('only completed payouts with a timestamp and matching post become updates', () => {
  const payment = { id: 'pay', submissionId: post.id, status: 'paid', paidAt: '2026-10-22T12:00:00Z' } as CreatorPayment
  const updates = creatorActivity([approval], [post], [payment, { ...payment, id: 'pending', status: 'pending' }, { ...payment, id: 'foreign', submissionId: 'other' }, { ...payment, id: 'undated', paidAt: null }])
  expect(updates.filter(item => item.type === 'paid').map(item => item.id)).toEqual(['payment:pay'])
})

test('new submissions do not duplicate stored events and latest activity comes first', () => {
  const submitted: CreatorUpdate = { ...approval, id: 'submitted', type: 'submitted', createdAt: post.createdAt }
  const updates = creatorActivity([submitted, approval], [post], [])
  expect(updates.map(item => item.id)).toEqual(['approval', 'submitted'])
})

test('bundled payouts show distinct posts once without merging unrelated payments', () => {
  const other = { ...post, id: 'second' }
  const payment = { id: 'one', submissionId: post.id, status: 'paid', paidAt: '2026-10-22T12:00:00Z', payoutRequestId: 'bundle' } as CreatorPayment
  const payouts = creatorActivity([], [post, other], [
    payment,
    { ...payment, id: 'two', submissionId: other.id },
    { ...payment, id: 'bonus' },
    { ...payment, id: 'separate', payoutRequestId: null },
    { ...payment, id: 'pending', submissionId: other.id, status: 'pending', payoutRequestId: 'unpaid' },
  ]).filter(item => item.type === 'paid')
  expect(payouts).toHaveLength(2)
  expect(payouts.find(item => item.id === 'payout:bundle')?.submissionIds).toEqual([post.id, other.id])
  expect(payouts.find(item => item.id === 'payout:bundle')?.title).toBe('2 posts included in this payout')
  expect(payouts.find(item => item.id === 'payment:separate')?.submissionIds).toEqual([post.id])
})


test('activity ages include minutes and hours before compact calendar dates', () => {
  const now = new Date('2026-10-25T12:00:00Z')
  const age = (minutes: number) => creatorUpdateAge(new Date(now.getTime() - minutes * 60_000).toISOString(), now)
  expect([-1, 0, 1, 59, 60, 1439, 1440, 10080, 43200].map(age)).toEqual(['Just now', 'Just now', '1m ago', '59m ago', '1hr ago', '23hr ago', '1d ago', '1w ago', '1mo ago'])
})

test('posts submitted at the same instant share one preview stack without grouping later posts', () => {
  const updates = creatorActivity([], [post, { ...post, id: 'second' }, { ...post, id: 'later', createdAt: '2026-10-20T12:01:00Z' }], []).filter(item => item.type === 'submitted')
  expect(updates).toHaveLength(2)
  expect(updates.find(item => item.submissionId === post.id)?.submissionIds).toEqual([post.id, 'second'])
})
