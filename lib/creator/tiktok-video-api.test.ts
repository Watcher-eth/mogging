import { expect, test } from 'bun:test'
import { hasVideoScope, queryTikTokVideos, TikTokVideoError } from './tiktok-video-api'

test('video permission requires an exact granted scope', () => {
  expect(hasVideoScope('user.info.basic,video.list')).toBe(true)
  expect(hasVideoScope('user.info.basic video.list')).toBe(true)
  expect(hasVideoScope('video.list.extra')).toBe(false)
  expect(hasVideoScope(null)).toBe(false)
})

test('only returned canonical videos become observations; unavailable videos are not zeros', async () => {
  let request: any
  const fetcher = (async (_url: any, options: any) => {
    request = options
    return Response.json({ error: { code: 'ok' }, data: { videos: [
      { id: '123', create_time: 1700000000, view_count: 0 },
      { id: '456', create_time: 1700000000 },
      { id: '123', create_time: 1700000000, view_count: 4 },
      { id: '999', create_time: 1700000000, view_count: 900 },
    ] } })
  })
  expect(await queryTikTokVideos('test-token', ['123','456','123'], fetcher)).toEqual([{ id: '123', create_time: 1700000000, view_count: 0 }])
  expect(JSON.parse(request.body)).toEqual({ filters: { video_ids: ['123','456'] } })
  expect(request.headers.Authorization).toBe('Bearer test-token')
  await expect(queryTikTokVideos('test-token', ['not-a-canonical-id'], fetcher)).rejects.toThrow('canonical')
  await expect(queryTikTokVideos('test-token', Array.from({ length: 21 }, (_,i) => String(i)), fetcher)).rejects.toThrow('20')
})

test('revoked permissions and rate limits are actionable without disclosing provider responses', async () => {
  for (const [status, reason] of [[401,'reconnect_required'],[429,'rate_limited'],[500,'provider_unavailable']] as const) {
    const fetcher = (async () => Response.json({ error: { code: 'error', message: 'private-provider-response' } }, { status }))
    const error = await queryTikTokVideos('secret', ['123'], fetcher).catch(error => error)
    expect(error).toBeInstanceOf(TikTokVideoError)
    expect(error.message).toBe(reason)
  }
})
