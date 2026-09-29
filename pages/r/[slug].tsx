import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ArrowRight, Download, ExternalLink, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getOrSetAnonymousActorId } from '@/lib/auth/anonymous'
import { createCreatorAttributionClick, setCreatorAttributionCookie } from '@/lib/creator/attribution'
import { creatorLinkPlatform } from '@/lib/creator/link-routing'

type CreatorLinkPageProps = {
  creator: string
  code: string
  deepLinkUrl: string
  storeUrl: string | null
  webUrl: string
}

export default function CreatorLinkPage(props: CreatorLinkPageProps) {
  return (
    <section className="mx-auto grid min-h-[70vh] w-full max-w-lg place-items-center py-12 text-center">
      <Head><title>Open Mogging</title><meta name="robots" content="noindex, nofollow" /></Head>
      <div className="w-full rounded-[28px] border border-zinc-200 bg-white p-7 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-9">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-black text-white"><Smartphone className="size-6" /></span>
        <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Shared by @{props.creator}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.055em]">Open Mogging</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-zinc-500">Already installed? Open the app below. After installing, reopen your creator’s link or enter this code in Mogging before purchasing.</p>
        <p className="mt-3 select-all break-all rounded-xl bg-zinc-100 p-3 font-mono text-sm" aria-label="Creator code">{props.code}</p>
        <p className="mt-3 text-sm text-zinc-500">If TikTok or Instagram blocks opening the app, use its browser menu to open this link in Safari.</p>
        <div className="mt-7 grid gap-2">
          <Button asChild className="h-12 rounded-xl"><a href={props.deepLinkUrl}><ExternalLink />Open in Mogging</a></Button>
          {props.storeUrl ? <Button asChild variant="outline" className="h-12 rounded-xl"><a href={props.storeUrl}><Download />Get the app</a></Button> : null}
          <Button asChild variant="ghost" className="h-11 rounded-xl"><a href={props.webUrl}>Continue on the website<ArrowRight /></a></Button>
        </div>
      </div>
    </section>
  )
}

export const getServerSideProps: GetServerSideProps<CreatorLinkPageProps> = async ({ params, query, req, res }) => {
  // Each response contains a visitor-specific signed token. Never cache or leak it in referrers.
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  const userAgent = req.headers['user-agent'] || ''
  const slug = typeof params?.slug === 'string' ? params.slug : ''
  const anonymousActorId = getOrSetAnonymousActorId(req as NextApiRequest, res as NextApiResponse)
  const attribution = await createCreatorAttributionClick({
    slug,
    anonymousActorId,
    referrer: req.headers.referer || null,
    userAgent,
  })
  if (!attribution) return { notFound: true }
  setCreatorAttributionCookie(res as NextApiResponse, attribution.token)
  const device = creatorLinkPlatform(userAgent)
  const storeUrl = device === 'android' ? attribution.link.androidAppStoreUrl : attribution.link.iosAppStoreUrl
  // Social browsers can suppress Universal Links; retain an explicit user-gesture fallback there.
  const socialBrowser = /Instagram|FBAN|FBAV|TikTok|musical_ly|Bytedance/i.test(userAgent)
  if (device !== 'web' && storeUrl && !attribution.isBot && !socialBrowser && query.fallback !== '1') {
    return { redirect: { destination: storeUrl, permanent: false } }
  }
  const webUrl = new URL('/', 'https://www.mogging.com')
  const account = await import('@/lib/db').then(({ db, schema }) => db.query.creatorSocialAccounts.findFirst({
    where: (accounts, { eq }) => eq(accounts.id, attribution.link.socialAccountId),
    columns: { handle: true, displayName: true, platform: true },
  }))
  if (!account) return { notFound: true }
  webUrl.searchParams.set('utm_source', account.platform)
  webUrl.searchParams.set('utm_medium', attribution.click.isBot ? 'preview' : 'creator')
  webUrl.searchParams.set('utm_campaign', attribution.link.slug)
  webUrl.searchParams.set('utm_content', account.handle || attribution.link.socialAccountId)
  webUrl.searchParams.set('attribution_token', attribution.token)
  if (device === 'web' && userAgent && !attribution.isBot && query.fallback !== '1') {
    return { redirect: { destination: webUrl.toString(), permanent: false } }
  }
  return {
    props: {
      creator: account.handle || account.displayName || 'TikTok creator',
      code: attribution.link.slug,
      deepLinkUrl: attribution.deepLinkUrl,
      storeUrl,
      webUrl: webUrl.toString(),
    },
  }
}
