import { useSyncExternalStore } from 'react'
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
    <DialogContent className="max-w-sm gap-4 rounded-3xl p-6">
      <DialogTitle className="pr-10 text-xl">Install Mogging for Android</DialogTitle>
      <DialogDescription>Download the app from Mogging, then open the downloaded file.</DialogDescription>
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-5 text-zinc-700">
        <li>Tap <strong>Download APK</strong>. If TikTok blocks the download, open this page in Chrome.</li>
        <li>Open the APK from Downloads.</li>
        <li>If Android asks, allow installs from your browser, then tap <strong>Install</strong>.</li>
      </ol>
      <a href={href} className="inline-flex min-h-11 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
        onClick={() => {
          trackWebEvent('landing_cta_clicked', { destination: 'android_apk', placement: 'android_download_dialog' })
          void flushWebAnalytics()
        }}>Download APK</a>
    </DialogContent>
  </Dialog>
}
