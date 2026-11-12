import { useSyncExternalStore } from 'react'
import { Download } from '@/components/ui/mogging-glyphs'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { flushWebAnalytics, trackWebEvent } from '@/lib/analytics/client'

const noSubscribe = () => () => {}
const noAndroidOnServer = () => false
const browserIsAndroid = () => /Android/i.test(navigator.userAgent)

export function useAndroidDevice() {
  return useSyncExternalStore(noSubscribe, browserIsAndroid, noAndroidOnServer)
}

export function useAndroidDownload() {
  const android = useAndroidDevice()
  const apkUrl = process.env.NEXT_PUBLIC_MOGGING_ANDROID_APK_URL
  if (!android || !apkUrl) return null
  try {
    const url = new URL(apkUrl)
    return url.protocol === 'https:' && url.pathname.endsWith('.apk') ? url.href : null
  } catch { return null }
}

export function AndroidDownload({ href, className }: { href: string; className?: string }) {
  return <Dialog>
    <DialogTrigger className={className}>Download for Android</DialogTrigger>
    <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-sm gap-5 overflow-y-auto rounded-3xl p-6">
      <div className="grid gap-1.5 pr-8">
        <span className="mb-2 grid size-10 place-items-center rounded-2xl bg-zinc-100 text-zinc-950">
          <Download className="size-5" aria-hidden="true" />
        </span>
        <DialogTitle className="text-2xl">Install Mogging for Android</DialogTitle>
        <DialogDescription>Download the app directly from Mogging.</DialogDescription>
      </div>
      <a href={href} className="inline-flex min-h-12 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
        onClick={() => {
          trackWebEvent('landing_cta_clicked', { destination: 'android_apk', placement: 'android_download_dialog' })
          void flushWebAnalytics()
        }}>Download app</a>
      <ol className="list-decimal space-y-2 border-t border-zinc-200 pt-4 pl-5 text-sm leading-5 text-zinc-700">
        <li>Open <strong>Mogging.apk</strong> from Downloads.</li>
        <li>If Android asks, allow installs from this source, then tap <strong>Install</strong>.</li>
      </ol>
      <p className="text-xs leading-5 text-zinc-600">If the download doesn’t start in TikTok, open this page in Chrome and try again.</p>
    </DialogContent>
  </Dialog>
}
