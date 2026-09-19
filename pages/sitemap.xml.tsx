import type { GetServerSideProps } from 'next'
import { canonicalUrl, publicPaths } from '@/lib/seo'

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400')
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${publicPaths.map((path) => `<url><loc>${canonicalUrl(path)}</loc></url>`).join('')}</urlset>`)
  return { props: {} }
}

export default function Sitemap() { return null }
