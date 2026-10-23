import { expect, test } from 'bun:test'
import { creatorActivity, type CreatorUpdate } from './updates'
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
