import Image from 'next/image'
import { useSyncExternalStore } from 'react'
import { Download } from '@/components/ui/mogging-glyphs'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { flushWebAnalytics, trackWebEvent } from '@/lib/analytics/client'

const noSubscribe = () => () => {}
const browserIsAndroid = () => {
  const browser = navigator as Navigator & { userAgentData?: { platform?: string } }
  return isAndroidDevice(browser.userAgent, browser.userAgentData?.platform)
}

export function isAndroidDevice(userAgent: string, platform?: string) {
  return platform?.replaceAll('"', '').toLowerCase() === 'android' || /\bAndroid\b/i.test(userAgent)
}

export function useAndroidDevice(androidOnServer = false) {
  return useSyncExternalStore(noSubscribe, browserIsAndroid, () => androidOnServer)
}

export function useAndroidDownload() {
  return useAndroidDevice() ? getAndroidDownloadUrl() : null
}

export function getAndroidDownloadUrl() {
  const apkUrl = process.env.NEXT_PUBLIC_MOGGING_ANDROID_APK_URL
  if (!apkUrl) return null
  try {
    const url = new URL(apkUrl)
    return url.protocol === 'https:' && url.pathname.endsWith('.apk') ? url.href : null
  } catch { return null }
}

export function AndroidDownload({ href, className }: { href: string; className?: string }) {
  return <Dialog onOpenChange={open => {
    if (open) trackWebEvent('landing_cta_clicked', { destination: 'android_install_dialog', placement: 'android_download_dialog' })
  }}>
    <DialogTrigger className={className}>
      <AndroidMark className="size-4 shrink-0" />
      Download for Android
    </DialogTrigger>
    <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-sm grid-cols-[minmax(0,1fr)] gap-4 overflow-y-auto rounded-3xl p-5 sm:p-6">
      <div className="space-y-3">
        <div className="relative size-14 sm:-mt-1">
          <Image src="/app-screenshots/android/icon.webp" alt="" width={56} height={56} unoptimized className="size-full rounded-[14px] object-cover" />
          <span aria-hidden="true" className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full border-2 border-white bg-[#3ddc84] text-zinc-950">
            <AndroidMark className="size-3.5" />
          </span>
        </div>
        <div className="space-y-1">
          <DialogTitle className="text-2xl leading-tight">Install for Android</DialogTitle>
          <DialogDescription>Download the app directly from Mogging.com.</DialogDescription>
        </div>
      </div>
      <ol className="list-decimal space-y-2 border-t border-zinc-200 pt-4 pl-5 text-sm leading-5 text-zinc-700">
        <li>Open <strong>Mogging.apk</strong> from Downloads.</li>
        <li>If Android asks, allow installs from this source, then tap <strong>Install</strong>.</li>
      </ol>
      <a href={href} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
        onClick={() => {
          trackWebEvent('landing_cta_clicked', { destination: 'android_apk', placement: 'android_download_dialog' })
          void flushWebAnalytics()
        }}>
        <Download className="size-4" aria-hidden="true" />
        Download Mogging
      </a>
      <p className="text-center text-xs leading-5 text-zinc-600">If the download doesn’t start in TikTok, open this page in Chrome and try again.</p>
    </DialogContent>
  </Dialog>
}

function AndroidMark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.65-.38l-1.87 3.23a11.37 11.37 0 0 0-9.84 0L5.21 5.92a.38.38 0 0 0-.65.38L6.4 9.48A10.89 10.89 0 0 0 1 18h22a10.89 10.89 0 0 0-5.4-8.52ZM7 15.25a.92.92 0 1 1 0-1.84.92.92 0 0 1 0 1.84Zm10 0a.92.92 0 1 1 0-1.84.92.92 0 0 1 0 1.84Z" />
    </svg>
  )
}
