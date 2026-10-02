import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import * as Avatar from '@radix-ui/react-avatar'
import type { GetServerSideProps, NextApiRequest, NextApiResponse } from 'next'
import { ArrowRight, Check, Copy, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MoggingWordmark } from '@/components/brand/mogging-wordmark'
import { getOrSetAnonymousActorId } from '@/lib/auth/anonymous'
import { createCreatorAttributionClick, setCreatorAttributionCookie } from '@/lib/creator/attribution'
import { creatorLinkPlatform } from '@/lib/creator/link-routing'
import { siteUrl } from '@/lib/seo'

type CreatorLinkPageProps = {
  creator: string
  avatarUrl: string | null
  url: string
  imageUrl: string
  code: string
  deepLinkUrl: string
  storeUrl: string | null
  webUrl: string
}

export default function CreatorLinkPage(props: CreatorLinkPageProps) {
  const [copied, setCopied] = useState(false)
  const title = `${props.creator} invited you to Mogging`
  const description = 'Start your ascent with a personalized plan to improve your looks, build better habits, and track your progress with Mogging.'
  async function copyCode() {
    try { await navigator.clipboard.writeText(props.code); setCopied(true) } catch { setCopied(false) }
  }
  return <div className="relative isolate min-h-dvh overflow-hidden bg-white text-[#181a1d]">
    <Head>
      <title key="title">{title}</title>
      <meta key="description" name="description" content={description} />
      <meta key="robots" name="robots" content="noindex, nofollow" />
      <meta name="referrer" content="no-referrer" />
      <link key="canonical" rel="canonical" href={props.url} />
      <meta key="og:title" property="og:title" content={title} />
      <meta key="og:description" property="og:description" content={description} />
      <meta key="og:url" property="og:url" content={props.url} />
      <meta key="og:image" property="og:image" content={props.imageUrl} />
      <meta key="og:image:width" property="og:image:width" content="1200" />
      <meta key="og:image:height" property="og:image:height" content="630" />
      <meta key="twitter:card" name="twitter:card" content="summary_large_image" />
      <meta key="twitter:title" name="twitter:title" content={title} />
      <meta key="twitter:description" name="twitter:description" content={description} />
      <meta key="twitter:image" name="twitter:image" content={props.imageUrl} />
    </Head>
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-dvh">
      <Image src="/creator-referral-background.png" alt="" fill priority sizes="100vw" className="object-cover opacity-[0.12]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_40%,white_100%)]" />
    </div>
    <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 sm:px-10 sm:py-8">
      <Link href="/" aria-label="Mogging home" className="flex items-center gap-2.5 text-xl"><Image src="/favicon.png" alt="" width={36} height={36} className="rounded-[10px]" /><MoggingWordmark /></Link>
      <Link href="/support" className="text-sm text-[#73777d] hover:text-black">Need help?</Link>
    </header>
    <section className="mx-auto flex w-full max-w-[520px] flex-col items-center px-6 pb-10 pt-9 text-center sm:pt-12">
      <div className="relative mb-7">
        <Avatar.Root className="flex size-36 overflow-hidden rounded-full border-[5px] border-white bg-[#eef0f2] shadow-[0_6px_24px_rgba(24,26,29,0.10)] sm:size-40">
          {props.avatarUrl ? <Avatar.Image src={props.avatarUrl} alt={props.creator} referrerPolicy="no-referrer" className="size-full object-cover" /> : null}
          <Avatar.Fallback className="grid size-full place-items-center text-5xl font-medium text-[#73777d]">{Array.from(props.creator)[0]}</Avatar.Fallback>
        </Avatar.Root>
        <Image src="/favicon.png" alt="Mogging" width={48} height={48} className="absolute -bottom-1 -right-1 rounded-[15px] border-[3px] border-white shadow-sm" />
      </div>
      <p className="flex max-w-full items-center gap-2 rounded-full border border-black/[0.05] bg-white/90 px-4 py-2.5 text-sm shadow-[0_2px_8px_rgba(24,26,29,0.03)]"><Sparkles className="size-4 shrink-0 text-[#00A8EF]" /><span className="truncate">An invite from <strong className="font-medium">{props.creator}</strong></span></p>
      <h1 className="mt-7 text-[clamp(2.75rem,10vw,3.6rem)] font-medium leading-[1.05] tracking-[-0.065em]">Mogging.<br /><span className="text-[#00A8EF]">Your face, in focus.</span></h1>
      <p className="mt-5 max-w-[350px] text-[15px] leading-6 text-[#73777d]">{description}</p>
      <div className="mt-8 w-full">
        <p className="mb-3 text-sm text-[#73777d]">{props.creator}’s creator code</p>
        <button type="button" onClick={() => void copyCode()} className="flex min-h-20 w-full items-center justify-center gap-4 rounded-[20px] border-2 border-dashed border-[#d9dde2] bg-white/80 px-5 py-5 text-[#00A8EF]" aria-label="Copy creator code">
          <span className="break-all font-mono text-2xl font-medium tracking-tight sm:text-3xl">{props.code}</span>
          {copied ? <Check className="size-5 shrink-0" /> : <Copy className="size-5 shrink-0" />}
        </button>
        <span role="status" className="sr-only">{copied ? 'Creator code copied' : ''}</span>
      </div>
      {props.storeUrl ? <Button asChild className="mt-6 h-14 w-full rounded-full bg-[#00A8EF] text-base font-medium text-white hover:bg-[#0099da]"><a href={props.storeUrl}>Get your Mogging Scan now<ArrowRight /></a></Button> : <Button asChild className="mt-6 h-14 w-full rounded-full bg-[#00A8EF] text-base text-white"><a href={props.webUrl}>Get your Mogging Scan now<ArrowRight /></a></Button>}
      <a href={props.deepLinkUrl} className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium">Already have the app? Open Mogging<ArrowRight className="size-4" /></a>
      <p className="mt-3 max-w-[360px] text-xs leading-5 text-[#93979d]">After installing, reopen this link or enter this creator code in the app before purchasing so your creator gets credit.</p>
      {props.storeUrl ? <a href={props.webUrl} className="mt-3 inline-flex min-h-11 items-center text-xs text-[#73777d] underline underline-offset-4">Continue on the website</a> : null}
      <nav aria-label="Legal" className="mt-8 flex gap-5 text-xs text-[#93979d]"><Link href="/privacy">Privacy</Link><Link href="/tos">Terms</Link></nav>
    </section>
  </div>
}

export const getServerSideProps: GetServerSideProps<CreatorLinkPageProps> = async ({ params, req, res }) => {
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
  const webUrl = new URL('/', 'https://www.mogging.com')
  const account = await import('@/lib/db').then(({ db }) => db.query.creatorSocialAccounts.findFirst({
    where: (accounts, { eq }) => eq(accounts.id, attribution.link.socialAccountId),
    columns: { handle: true, displayName: true, platform: true, avatarUrl: true },
  }))
  if (!account) return { notFound: true }
  webUrl.searchParams.set('utm_source', account.platform)
  webUrl.searchParams.set('utm_medium', attribution.click.isBot ? 'preview' : 'creator')
  webUrl.searchParams.set('utm_campaign', attribution.link.slug)
  webUrl.searchParams.set('utm_content', account.handle || attribution.link.socialAccountId)
  webUrl.searchParams.set('attribution_token', attribution.token)

  return {
    props: {
      creator: account.displayName || account.handle || 'Your creator',
      avatarUrl: account.avatarUrl,
      url: `${siteUrl}/r/${slug}`,
      imageUrl: `${siteUrl}/api/og/creator-referral?slug=${encodeURIComponent(slug)}`,
      code: slug,
      deepLinkUrl: attribution.deepLinkUrl,
      storeUrl,
      webUrl: webUrl.toString(),
    },
  }
}
