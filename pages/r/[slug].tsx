import { useEffect } from 'react'
import type { GetServerSideProps } from 'next'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ArrowRight, Download, ExternalLink, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getOrSetAnonymousActorId } from '@/lib/auth/anonymous'
import { createCreatorAttributionClick, setCreatorAttributionCookie } from '@/lib/creator/attribution'

type CreatorLinkPageProps = {
  creator: string
  platform: 'tiktok' | 'instagram'
  deepLinkUrl: string
  iosAppStoreUrl: string
  androidAppStoreUrl: string | null
  webUrl: string
  isBot: boolean
}

export default function CreatorLinkPage(props: CreatorLinkPageProps) {
  useEffect(() => {
    if (props.isBot) return
    const ua = navigator.userAgent
    const isIos = /iPad|iPhone|iPod/.test(ua)
    const isAndroid = /Android/.test(ua)
    if (!isIos && !isAndroid) {
      window.location.replace(props.webUrl)
      return
    }
    window.location.assign(props.deepLinkUrl)
  }, [props.deepLinkUrl, props.isBot, props.webUrl])

  async function installWithAttribution() {
    await navigator.clipboard?.writeText(props.deepLinkUrl).catch(() => null)
    window.location.assign(props.iosAppStoreUrl)
  }

  return (
    <section className="mx-auto grid min-h-[70vh] w-full max-w-lg place-items-center py-12 text-center">
      <div className="w-full rounded-[28px] border border-zinc-200 bg-white p-7 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-9">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-black text-white"><Smartphone className="size-6" /></span>
        <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Shared by @{props.creator}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.055em]">Opening Mogging</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-zinc-500">If the app isn’t installed, we’ll take you to the App Store. Your visit stays credited to this {props.platform === 'tiktok' ? 'TikTok' : 'Instagram'} account.</p>
        <div className="mt-7 grid gap-2">
          <Button asChild className="h-12 rounded-xl"><a href={props.deepLinkUrl}><ExternalLink />Open in Mogging</a></Button>
          <Button type="button" variant="outline" className="h-12 rounded-xl" onClick={() => void installWithAttribution()}><Download />Get the app &amp; keep credit</Button>
          <Button asChild variant="ghost" className="h-11 rounded-xl"><a href={props.webUrl}>Continue on the website<ArrowRight /></a></Button>
        </div>
      </div>
    </section>
  )
}

export const getServerSideProps: GetServerSideProps<CreatorLinkPageProps> = async ({ params, req, res }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : ''
  const anonymousActorId = getOrSetAnonymousActorId(req as NextApiRequest, res as NextApiResponse)
  const attribution = await createCreatorAttributionClick({
    slug,
    anonymousActorId,
    referrer: req.headers.referer || null,
    userAgent: req.headers['user-agent'] || null,
  })
  if (!attribution) return { notFound: true }
  setCreatorAttributionCookie(res as NextApiResponse, attribution.token)
  const webUrl = new URL('/', 'https://www.mogging.com')
  const account = await import('@/lib/db').then(({ db, schema }) => db.query.creatorSocialAccounts.findFirst({
    where: (accounts, { eq }) => eq(accounts.id, attribution.link.socialAccountId),
    columns: { handle: true, platform: true },
  }))
  if (!account) return { notFound: true }
  webUrl.searchParams.set('utm_source', account.platform)
  webUrl.searchParams.set('utm_medium', attribution.click.isBot ? 'preview' : 'creator')
  webUrl.searchParams.set('utm_campaign', attribution.link.slug)
  webUrl.searchParams.set('utm_content', account.handle)
  webUrl.searchParams.set('attribution_token', attribution.token)
  return {
    props: {
      creator: account.handle,
      platform: account.platform,
      deepLinkUrl: attribution.deepLinkUrl,
      iosAppStoreUrl: attribution.link.iosAppStoreUrl,
      androidAppStoreUrl: attribution.link.androidAppStoreUrl,
      webUrl: webUrl.toString(),
      isBot: attribution.isBot,
    },
  }
}
