import Link from 'next/link'
import type { ReactNode } from 'react'
import { SeoHead } from '@/components/app/seo-head'
import { canonicalUrl, siteUrl } from '@/lib/seo'

type GuidePageProps = {
  title: string
  description: string
  path: string
  children: ReactNode
}

export function GuidePage({ title, description, path, children }: GuidePageProps) {
  const url = canonicalUrl(path)
  return (
    <>
      <SeoHead title={`${title} | Mogging`} description={description} path={path} structuredData={{
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'Article', '@id': `${url}#article`, headline: title, description, mainEntityOfPage: url, inLanguage: 'en', author: { '@type': 'Organization', name: 'Mogging', url: `${siteUrl}/` }, publisher: { '@type': 'Organization', name: 'Mogging', url: `${siteUrl}/` } },
          { '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Mogging', item: `${siteUrl}/` },
            { '@type': 'ListItem', position: 2, name: title, item: url },
          ] },
        ],
      }} />
      <article className="mx-auto max-w-3xl py-8 text-zinc-900 sm:py-16">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-zinc-600">
          <Link href="/" className="underline underline-offset-4">Mogging</Link> <span aria-hidden="true"> / </span> <span>{title}</span>
        </nav>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">{title}</h1>
        <p className="mt-5 text-sm text-zinc-600">By the Mogging team</p>
        <div className="mt-10 space-y-10 text-lg leading-8 text-zinc-700 [&_a]:text-black [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-black [&_h3]:mb-2 [&_h3]:font-semibold [&_p+p]:mt-4 [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_section]:scroll-mt-28">
          {children}
        </div>
        <aside className="mt-14 border-t border-zinc-200 pt-8">
          <h2 className="text-xl font-semibold">Explore Mogging</h2>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-base underline underline-offset-4">
            <Link href="/">The Mogging app</Link>
            <Link href="/analysis">Try face analysis</Link>
            <Link href={path === '/what-is-mogging' ? '/how-face-analysis-works' : '/what-is-mogging'}>{path === '/what-is-mogging' ? 'How face analysis works' : 'What is mogging?'}</Link>
            <Link href="/support">Contact us or suggest a correction</Link>
          </div>
        </aside>
      </article>
    </>
  )
}
