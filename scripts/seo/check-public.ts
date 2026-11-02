import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { canonicalUrl, siteUrl } from '../../lib/seo'

const args = new Map(process.argv.slice(2).map(value => {
  const [name, ...rest] = value.split('=')
  return [name, rest.join('=')]
}))
const base = new URL(args.get('--base') || siteUrl)
if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Use an HTTP(S) site URL')
const paths = ['/', '/faq', '/analysis', '/what-is-mogging', '/how-face-analysis-works']
const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w-]+)=["']([^"']*)["']/g)].map(match => [match[1], match[2]]))
const fetchText = async (path: string) => {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'MoggingSiteHealth/1.0' } })
  return { status: response.status, url: response.url, headers: response.headers, body: await response.text() }
}
const pages = await Promise.all(paths.map(async path => {
  try {
    const response = await fetchText(path)
    const head = response.body.split('</head>')[0]
    const tags = [...head.matchAll(/<(?:link|meta)\b[^>]*>/g)].map(match => attrs(match[0]))
    const canonical = tags.find(tag => tag.rel === 'canonical')?.href ?? null
    const robots = tags.filter(tag => ['robots', 'googlebot'].includes(tag.name)).map(tag => tag.content).join(', ')
    const header = response.headers.get('x-robots-tag') || ''
    return { path, status: response.status, finalUrl: response.url, canonical, robots, header,
      healthy: response.status === 200 && canonical === canonicalUrl(path) && !/\bnoindex\b/i.test(`${robots}, ${header}`) }
  } catch { return { path, healthy: false, reason: 'HTTP check failed or timed out; no indexing conclusion.' } }
}))
let sitemap: { healthy: boolean; status?: number; urls?: string[]; reason?: string }
let robots: { healthy: boolean; status?: number; reason?: string }
try {
  const response = await fetchText('/sitemap.xml')
  const urls = [...response.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
  sitemap = { status: response.status, urls, healthy: response.status === 200 && paths.every(path => urls.includes(canonicalUrl(path))) }
} catch { sitemap = { healthy: false, reason: 'Sitemap fetch failed.' } }
try {
  const response = await fetchText('/robots.txt')
  robots = { status: response.status, healthy: response.status === 200 && !/^Disallow:\s*\/\s*$/im.test(response.body) }
} catch { robots = { healthy: false, reason: 'Robots fetch failed.' } }
const report = { checkedAt: new Date().toISOString(), base: base.origin, pages, sitemap, robots,
  limitation: 'HTTP/indexability checks do not establish Google crawling, indexing, rankings or link credit.' }
const output = args.get('--output')
if (output) {
  await mkdir(dirname(resolve(output)), { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
}
console.log(JSON.stringify(report, null, 2))
process.exitCode = pages.every(page => page.healthy) && sitemap.healthy && robots.healthy ? 0 : 1
