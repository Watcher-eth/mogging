import { afterEach, expect, mock, test } from 'bun:test'
import { emptyPostPreview, getCreatorPostPreview, parsePublicPostPreview } from './post-preview'

const originalFetch = globalThis.fetch
const cover = 'https://p16-common-sign.tiktokcdn.com/post.jpg?signature=abc'
afterEach(() => { globalThis.fetch = originalFetch })

function tiktokHtml(id = '123', views: number | null = 42_300) {
  return `<script id="__FRONTITY_CONNECT_STATE__">${JSON.stringify({source:{data:{'/embed/v2/123':{videoData:{itemInfos:{id,text:'The real caption #mogging',coversOrigin:[cover],playCount:views,video:{videoMeta:{width:576,height:576}}},authorInfos:{uniqueId:'creator'}}}}}})}</script>`
}

test('unsupported URLs never make provider requests', async () => {
  const fetcher = mock(async () => new Response('{}'))
  globalThis.fetch = fetcher as unknown as typeof fetch
  for (const url of [null, 'bad url', 'https://tiktok.com.evil.com/@name/video/123', 'http://localhost:3000/private']) {
    expect(await getCreatorPostPreview(url)).toEqual(emptyPostPreview)
  }
  expect(fetcher).not.toHaveBeenCalled()
})

test('public TikTok embed restores original covers, captions, dimensions and current views', async () => {
  const fetcher = mock(async (_url: string | URL | Request) => new Response(tiktokHtml()))
  globalThis.fetch = fetcher as unknown as typeof fetch
  expect(await getCreatorPostPreview('https://www.tiktok.com/@creator/video/123?tracking=private')).toMatchObject({thumbnailUrl:cover,caption:'The real caption #mogging',authorName:'creator',width:576,height:576,viewCount:42_300})
  expect(String(fetcher.mock.calls[0][0])).toBe('https://www.tiktok.com/embed/v2/123')
})

test('oEmbed remains a fallback without inventing unavailable view counts', async () => {
  globalThis.fetch = mock(async (url: string | URL | Request) => String(url).includes('/oembed?')
    ? Response.json({thumbnail_url:cover,title:'Fallback caption',thumbnail_width:720,thumbnail_height:1280})
    : new Response('',{status:503})) as unknown as typeof fetch
  expect(await getCreatorPostPreview('https://www.tiktok.com/@creator/video/123')).toMatchObject({thumbnailUrl:cover,caption:'Fallback caption',width:720,height:1280,viewCount:null})
})

test('public post page recovers details when the TikTok embed is unavailable', async () => {
  const itemStruct = {id:'123',desc:'Public post caption',author:{uniqueId:'creator'},video:{width:720,height:1280,originCover:cover},stats:{playCount:123456}}
  const html = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${JSON.stringify({__DEFAULT_SCOPE__:{'webapp.video-detail':{itemInfo:{itemStruct}}}})}</script>`
  const fetcher = mock(async (url: string | URL | Request) => String(url).includes('/embed/v2/') ? new Response('',{status:503}) : new Response(html))
  globalThis.fetch = fetcher as unknown as typeof fetch
  expect(await getCreatorPostPreview('https://www.tiktok.com/@creator/video/123?tracking=private')).toMatchObject({thumbnailUrl:cover,caption:'Public post caption',width:720,height:1280,viewCount:123456})
  expect(String(fetcher.mock.calls[1][0])).toBe('https://www.tiktok.com/@creator/video/123')
})

test('Instagram reads its own post details and decodes Unicode and signed image URLs', () => {
  const context = {context:{shortcode:'ABC_12'},gql_data:{shortcode_media:{shortcode:'ABC_12',display_url:'https://scontent.cdninstagram.com/post.jpg?a=1&b=2',owner:{username:'creator'},dimensions:{width:1206,height:2144},edge_media_to_caption:{edges:[{node:{text:'Your caption ✨ @moggingcom'}}]},video_view_count:9707}}}
  const html = `<script>init(${JSON.stringify({contextJSON:JSON.stringify(context)})})</script>`
  expect(parsePublicPostPreview(html,'instagram','ABC_12')).toMatchObject({thumbnailUrl:'https://scontent.cdninstagram.com/post.jpg?a=1&b=2',caption:'Your caption ✨ @moggingcom',authorName:'creator',width:1206,height:2144,viewCount:9707})
})

test('Instagram image-only fallback selects the post cover rather than the avatar', async () => {
  globalThis.fetch = mock(async () => new Response('<img src="https://cdninstagram.com/avatar.jpg"><img class="EmbeddedMediaImage" src="https://scontent.cdninstagram.com/post.jpg?a=1&amp;b=2">')) as unknown as typeof fetch
  expect(await getCreatorPostPreview('https://www.instagram.com/reel/ABC_12/')).toEqual({...emptyPostPreview,thumbnailUrl:'https://scontent.cdninstagram.com/post.jpg?a=1&b=2'})
})

test('mismatched post IDs and untrusted image hosts are rejected; zero views remain valid', () => {
  expect(parsePublicPostPreview(tiktokHtml('another-post'),'tiktok','123')).toEqual(emptyPostPreview)
  expect(parsePublicPostPreview(tiktokHtml().replace(cover,'https://tiktokcdn.com.evil.com/post.jpg'),'tiktok','123').thumbnailUrl).toBeNull()
  expect(parsePublicPostPreview(tiktokHtml('123',0),'tiktok','123').viewCount).toBe(0)
  expect(parsePublicPostPreview(tiktokHtml('123',null),'tiktok','123').viewCount).toBeNull()
  expect(parsePublicPostPreview('<script>not JSON</script>','tiktok','123')).toEqual(emptyPostPreview)
})

test('unavailable posts and provider errors fall back gracefully', async () => {
  globalThis.fetch = mock(async () => new Response('',{status:404})) as unknown as typeof fetch
  expect(await getCreatorPostPreview('https://www.tiktok.com/@creator/video/123')).toEqual(emptyPostPreview)
  globalThis.fetch = mock(async () => { throw Error('Provider offline') }) as unknown as typeof fetch
  expect(await getCreatorPostPreview('https://www.tiktok.com/@creator/video/123')).toEqual(emptyPostPreview)
})
