import { isEmbeddedBrowser } from '@/lib/auth/browser-flow'
import { SkeletonImage } from '@/components/ui/skeleton-image'
import { SocialPlatformLogo } from '@/components/brand/social-platform-logo'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getProviders, signIn } from 'next-auth/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

export default function LoginDialogContent({
  audience = 'app',
  callbackUrl,
  onOpenChange,
  open,
  children,
}: {
  audience?: 'app' | 'creator' | 'scan'
  callbackUrl: string
  onOpenChange: (open: boolean) => void
  open: boolean
  children?: ReactNode
}) {
  const [availableProviders, setAvailableProviders] = useState<Set<string> | null>(null)
  const [embeddedAuth, setEmbeddedAuth] = useState(false)
  const authPending = useRef(false)
  const modelImages = [
    '/model.png',
    '/landing/report-city-portrait.webp',
    '/model3.png',
    '/model4.png',
    '/model5.png',
    '/model6.png',
    '/model7.png',
    '/model8.png',
    '/model9.png',
    '/model10.png',
    '/model11.png',
    '/model12.png',
    '/model13.png',
    '/model14.png',
  ]

  useEffect(() => {
    if (!open) return
    authPending.current = false
    setEmbeddedAuth(isEmbeddedBrowser(navigator.userAgent))
    let cancelled = false

    getProviders().then((providers) => {
      if (cancelled) return
      setAvailableProviders(new Set(Object.keys(providers ?? {})))
    })

    return () => {
      cancelled = true
    }
  }, [open])

  function continueWithProvider(provider: string) {
    if (authPending.current) return
    authPending.current = true
    document.cookie = `mogging_auth_provider=${encodeURIComponent(provider)}; Path=/; Max-Age=900; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
    void signIn(provider, { callbackUrl }).catch(() => {
      authPending.current = false
      toast.error('Unable to open sign-in. Please try again.')
    })
  }
  function continueWithGoogle() { continueWithProvider('google') }
  function continueWithMeta() { continueWithProvider('facebook') }
  function continueWithX() { continueWithProvider('twitter') }
  function continueWithTikTok() { continueWithProvider('tiktok') }


  const authButtons = [
    {
      id: 'google',
      label: 'Continue with Google',
      onClick: continueWithGoogle,
      mark: <GoogleMark />,
    },
    {
      id: 'facebook',
      label: 'Continue with Meta',
      onClick: continueWithMeta,
      mark: <MetaMark />,
    },
    {
      id: 'twitter',
      label: 'Continue with X',
      onClick: continueWithX,
      mark: <XMark />,
    },
    {
      id: 'tiktok',
      label: 'Continue with TikTok',
      onClick: continueWithTikTok,
      mark: <TikTokMark />,
    },
  ].filter((button) => audience === 'creator' ? ['google', 'tiktok', 'facebook'].includes(button.id) : availableProviders === null || availableProviders.has(button.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-creator-controls={audience === 'creator' || undefined} className="max-h-[min(760px,calc(100svh-2rem))] max-w-[430px] overflow-hidden rounded-[34px] border border-white bg-white p-0 shadow-[0_32px_120px_rgba(15,23,42,0.24)]">
        <div className="relative grid content-start gap-4 overflow-y-auto px-7 pb-6 pt-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_70%_48%_at_50%_10%,rgba(244,244,245,0.82)_0%,rgba(255,255,255,0)_72%)]" />

          <div className="relative">
            {audience === 'scan' ? <img src="/scan/icon-192.png" alt="" className="mx-auto my-4 size-16 rounded-2xl" /> : <div className="relative mx-[-52px] h-[160px]">
              {modelImages.map((src, index) => {
                const layout = bubbleLayout[index]

                return (
                  <div
                    key={src}
                    className="group absolute rounded-full"
                    style={{
                      height: layout.size,
                      left: `${layout.left}%`,
                      top: `${layout.top}%`,
                      transform: `translate(-50%, -50%) rotate(${layout.rotate}deg)`,
                      width: layout.size,
                      zIndex: layout.z,
                    }}
                  >
                    <div className="relative h-full w-full overflow-hidden rounded-full bg-white/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.95),inset_10px_16px_28px_rgba(255,255,255,0.16),inset_-14px_-18px_30px_rgba(0,0,0,0.1),0_20px_44px_rgba(15,23,42,0.2)] ring-1 ring-white/85 backdrop-blur-md transition-transform duration-300 ease-out group-hover:scale-[1.055]">
                      <SkeletonImage className="scale-[1.04] object-cover saturate-[1.08]" src={src} alt="" aria-hidden="true" sizes={`${layout.size}px`} />
                      <span className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(145deg,rgba(255,255,255,0.38)_0%,rgba(255,255,255,0.08)_28%,rgba(255,255,255,0)_48%,rgba(0,0,0,0.16)_100%)]" />
                      <span className="pointer-events-none absolute inset-[1px] rounded-full border-2 border-white/55" />
                      <span className="pointer-events-none absolute -inset-[16%] rounded-full bg-[radial-gradient(circle_at_76%_82%,rgba(255,255,255,0.24)_0%,rgba(255,255,255,0)_34%)]" />
                    </div>
                  </div>
                )
              })}

              <div className="absolute left-1/2 top-[76%] z-30 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[30px] font-light leading-none text-black shadow-[0_18px_42px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.9)]">
                <span className="relative -top-[2px]">+</span>
              </div>
            </div>}

            <DialogHeader className="relative mx-auto mt-2 max-w-[330px] text-left">
              <DialogTitle className="text-3xl font-semibold leading-[1.06] tracking-[-0.055em]">
                {audience === 'scan' ? 'Sign in to Mogging' : <>Enter Mogging.<br />Rate. Battle. Rank.</>}
              </DialogTitle>
              <DialogDescription className="mt-3 max-w-[310px] text-left text-sm leading-5 text-zinc-500">
                {audience === 'scan' ? 'Use the same account you used at checkout.' : 'Sign in first. If this is your first time, you will set your profile after auth.'}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="grid gap-2">
            {authButtons.map((button) => (
              <button
                key={button.id}
                className="relative flex h-12 w-full items-center justify-center gap-4 rounded-full border border-zinc-200 bg-white px-5 text-sm font-semibold text-black shadow-[0_14px_38px_rgba(15,23,42,0.08)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_46px_rgba(15,23,42,0.11)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                disabled={audience === 'creator' && (availableProviders === null || !availableProviders.has(button.id))}
                title={audience === 'creator' && availableProviders !== null && !availableProviders.has(button.id) ? 'Currently unavailable' : undefined}
                onClick={button.onClick}
                type="button"
              >
                {button.mark}
                {button.label}
              </button>
            ))}
          </div>
          {audience === 'creator' && availableProviders !== null && authButtons.some((button) => !availableProviders.has(button.id)) ? <p className="text-center text-xs text-zinc-500">Some sign-in options are currently unavailable.</p> : null}
          {audience === 'creator' && embeddedAuth ? <p className="text-sm leading-5 text-zinc-600">For reliable sign-in, open this page in Safari or Chrome from the browser menu, then continue there.</p> : null}
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}

const bubbleLayout = [
  { left: 8, top: 55, size: 74, rotate: -12, z: 8 },
  { left: 19, top: 42, size: 92, rotate: 10, z: 10 },
  { left: 28, top: 63, size: 78, rotate: -4, z: 13 },
  { left: 39, top: 52, size: 112, rotate: 7, z: 15 },
  { left: 50, top: 43, size: 84, rotate: -10, z: 14 },
  { left: 58, top: 62, size: 128, rotate: 4, z: 20 },
  { left: 69, top: 46, size: 82, rotate: -7, z: 16 },
  { left: 78, top: 60, size: 112, rotate: 6, z: 19 },
  { left: 90, top: 43, size: 86, rotate: 12, z: 12 },
  { left: 3, top: 34, size: 72, rotate: 8, z: 5 },
  { left: 14, top: 72, size: 58, rotate: -8, z: 11 },
  { left: 88, top: 72, size: 62, rotate: -6, z: 17 },
  { left: 99, top: 58, size: 58, rotate: 9, z: 9 },
  { left: 72, top: 28, size: 68, rotate: -11, z: 7 },
] as const

function GoogleMark() {
  return (
    <svg className="size-6" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.78-.07-1.53-.2-2.23H12v4.22h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.52Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.45l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 13.88a6.02 6.02 0 0 1 0-3.76V7.53H3.06a10 10 0 0 0 0 8.94l3.34-2.59Z" />
      <path fill="#EA4335" d="M12 5.98c1.47 0 2.8.51 3.84 1.5l2.87-2.88C16.97 2.98 14.7 2 12 2a10 10 0 0 0-8.94 5.53l3.34 2.59C7.19 7.74 9.4 5.98 12 5.98Z" />
    </svg>
  )
}

function MetaMark() {
  return (
    <svg className="size-6" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#0866FF" d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.9h2.54V9.84c0-2.52 1.5-3.92 3.77-3.92 1.1 0 2.24.2 2.24.2v2.48H15.2c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.9h-2.34V22C18.34 21.24 22 17.08 22 12.06Z" />
    </svg>
  )
}

function XMark() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M18.9 2h3.4l-7.43 8.49L23.6 22h-6.84l-5.36-7.01L5.27 22H1.87l7.94-9.08L1.45 2h7.02l4.84 6.4L18.9 2Zm-1.2 17.98h1.88L7.45 3.92H5.43L17.7 19.98Z" />
    </svg>
  )
}

function TikTokMark() {
  return <SocialPlatformLogo platform="tiktok" />
}
