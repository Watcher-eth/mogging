import Link from 'next/link'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { ReactNode } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/router'
import { AppNav } from '@/components/app/nav'
import { CameraSheet } from '@/components/analysis/camera-sheet'
import { Button } from '@/components/ui/button'
import { apiPatch } from '@/lib/api/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type AppShellProps = {
  children: ReactNode
}

const AUTH_PROFILE_DRAFT_KEY = 'mogging-auth-profile-draft'

export function AppShell({ children }: AppShellProps) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const immersive = router.pathname === '/' || router.pathname === '/analysis' || router.pathname === '/leaderboard'
  const [loginOpen, setLoginOpen] = useState(false)
  const appliedProfileDraftRef = useRef(false)

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id || appliedProfileDraftRef.current) return

    const rawDraft = window.localStorage.getItem(AUTH_PROFILE_DRAFT_KEY)
    if (!rawDraft) return

    appliedProfileDraftRef.current = true
    window.localStorage.removeItem(AUTH_PROFILE_DRAFT_KEY)

    try {
      const draft = JSON.parse(rawDraft) as {
        avatarDataUrl?: string
        instagramUsername?: string
        name?: string
      }

      if (!draft.name || !draft.avatarDataUrl) return

      void apiPatch('/api/user/me', {
        imageData: draft.avatarDataUrl,
        instagramUsername: draft.instagramUsername || null,
        name: draft.name,
      })
    } catch {
      // Ignore malformed local onboarding drafts.
    }
  }, [session?.user?.id, status])

  return (
    <div className={immersive ? 'min-h-screen bg-white' : 'min-h-screen bg-background'}>
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl">
        <div className="grid h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 sm:h-20 sm:grid-cols-[1fr_auto_1fr] sm:gap-4 sm:px-10">
          <Link href="/" className="text-xl font-semibold leading-none tracking-[-0.06em] text-black sm:text-4xl">
            Mogging
          </Link>

          <AppNav />

          <div className="flex justify-end">
            {status === 'loading' ? (
              <div className="h-8 w-14 animate-pulse rounded-lg border border-zinc-200 bg-white sm:h-10 sm:w-24" />
            ) : session?.user ? (
              <Button
                className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-xs font-medium text-black shadow-none hover:bg-zinc-50 sm:h-10 sm:rounded-xl sm:px-3 sm:text-sm"
                variant="outline"
                size="sm"
                onClick={() => signOut({ callbackUrl: '/' })}
              >
                <span className="grid size-5 place-items-center rounded-full bg-zinc-100 text-[10px] uppercase text-black/70 sm:size-6 sm:text-[11px]">
                  {session.user.name?.slice(0, 1) || session.user.email?.slice(0, 1) || 'U'}
                </span>
                <span className="hidden max-w-28 truncate sm:inline">
                  {session.user.name || session.user.email || 'Profile'}
                </span>
              </Button>
            ) : (
              <Button className="h-8 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-black shadow-none hover:bg-zinc-50 sm:h-10 sm:rounded-xl sm:px-5 sm:text-sm" variant="outline" size="sm" onClick={() => setLoginOpen(true)}>
                Login
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className={immersive ? 'w-full' : 'mx-auto w-full max-w-6xl px-4 py-8 sm:px-6'}>
        {children}
      </main>

      <LoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        callbackUrl={router.asPath || '/'}
      />
    </div>
  )
}

export function LoginDialog({
  callbackUrl,
  onOpenChange,
  open,
}: {
  callbackUrl: string
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [step, setStep] = useState<'intro' | 'profile'>('intro')
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [instagramUsername, setInstagramUsername] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const modelImages = [
    '/model.png',
    '/model2.png',
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
    if (open) return

    window.setTimeout(() => {
      setStep('intro')
    }, 180)
  }, [open])

  function continueWithGoogle() {
    if (!displayName.trim() || !avatarDataUrl) return

    window.localStorage.setItem(AUTH_PROFILE_DRAFT_KEY, JSON.stringify({
      avatarDataUrl,
      instagramUsername: instagramUsername.trim(),
      name: displayName.trim(),
    }))
    void signIn('google', { callbackUrl })
  }

  async function handleAvatarFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setAvatarDataUrl(await readFileAsDataUrl(file))
  }

  const canContinue = Boolean(displayName.trim() && avatarDataUrl)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(760px,calc(100svh-2rem))] max-w-[430px] overflow-hidden rounded-[34px] border border-white bg-white p-0 shadow-[0_32px_120px_rgba(15,23,42,0.24)]">
        <div className="relative grid content-start gap-6 overflow-hidden px-7 pb-7 pt-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_70%_48%_at_50%_10%,rgba(244,244,245,0.82)_0%,rgba(255,255,255,0)_72%)]" />

          {step === 'intro' ? (
            <>
              <div className="relative">
                <div className="relative mx-[-52px] mt-1 h-[220px]">
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
                        <div className="relative h-full w-full overflow-hidden rounded-full bg-white/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.95),inset_10px_16px_28px_rgba(255,255,255,0.16),inset_-14px_-18px_30px_rgba(0,0,0,0.1),0_20px_44px_rgba(15,23,42,0.2)] ring-1 ring-white/85 backdrop-blur-md transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.055]">
                          <img className="h-full w-full scale-[1.04] object-cover saturate-[1.08]" src={src} alt="" aria-hidden="true" />
                          <span className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(145deg,rgba(255,255,255,0.38)_0%,rgba(255,255,255,0.08)_28%,rgba(255,255,255,0)_48%,rgba(0,0,0,0.16)_100%)]" />
                          <span className="pointer-events-none absolute inset-[1px] rounded-full border-2 border-white/55" />
                          <span className="pointer-events-none absolute -inset-[16%] rounded-full bg-[radial-gradient(circle_at_76%_82%,rgba(255,255,255,0.24)_0%,rgba(255,255,255,0)_34%)]" />
                        </div>
                      </div>
                    )
                  })}

                  <div className="absolute left-1/2 top-[78%] z-30 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[34px] font-light leading-none text-black shadow-[0_18px_42px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.9)]">
                    <span className="relative -top-[2px]">+</span>
                  </div>
                </div>

                <DialogHeader className="relative mx-auto mt-3 max-w-[330px] text-left">
                  <DialogTitle className="text-4xl font-semibold leading-[1.08] tracking-[-0.06em]">
                    Enter Mogging.
                    <br />
                    Rate. Battle. Rank.
                  </DialogTitle>
                  <DialogDescription className="mt-4 max-w-[310px] text-left text-sm leading-6 text-zinc-500">
                    Get your score, vote in face battles, and climb the global leaderboard.
                  </DialogDescription>
                </DialogHeader>
              </div>

              <button
                className="relative flex h-14 w-full items-center justify-center rounded-full border border-zinc-200 bg-white px-5 text-base font-semibold text-black shadow-[0_14px_38px_rgba(15,23,42,0.08)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_46px_rgba(15,23,42,0.11)] active:translate-y-0"
                onClick={() => setStep('profile')}
                type="button"
              >
                Continue
              </button>
            </>
          ) : (
            <div className="relative grid gap-5 pt-2">
              <DialogHeader className="text-left">
                <DialogTitle className="text-4xl font-semibold leading-[1.02] tracking-[-0.06em]">Set your profile.</DialogTitle>
                <DialogDescription className="mt-3 text-left text-sm leading-6 text-zinc-500">
                  Add the avatar and name people will see on rankings.
                </DialogDescription>
              </DialogHeader>

              <input ref={fileInputRef} className="hidden" type="file" accept="image/*" onChange={handleAvatarFile} />

              <div className="grid justify-items-center gap-3">
                <button
                  className="group relative size-32 overflow-hidden rounded-full border-2 border-white bg-zinc-100 shadow-[0_22px_60px_rgba(15,23,42,0.16)]"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  {avatarDataUrl ? (
                    <img className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" src={avatarDataUrl} alt="Profile avatar preview" />
                  ) : (
                    <span className="grid h-full w-full place-items-center font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Upload</span>
                  )}
                </button>
                <div className="flex gap-2">
                  <button className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-black" onClick={() => fileInputRef.current?.click()} type="button">
                    Upload
                  </button>
                  <button className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-black" onClick={() => setCameraOpen(true)} type="button">
                    Camera
                  </button>
                </div>
              </div>

              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Name</span>
                <input
                  className="h-12 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-medium text-black outline-none transition-colors focus:border-black"
                  maxLength={100}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Your display name"
                  value={displayName}
                />
              </label>

              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Instagram</span>
                <div className="grid h-12 grid-cols-[auto_1fr] items-center overflow-hidden rounded-2xl border border-zinc-200 bg-white focus-within:border-black">
                  <span className="pl-4 pr-1 text-sm text-zinc-400">instagram.com/</span>
                  <input
                    className="h-full min-w-0 bg-transparent pr-4 text-sm font-medium text-black outline-none"
                    maxLength={80}
                    onChange={(event) => setInstagramUsername(event.target.value)}
                    placeholder="username"
                    value={instagramUsername}
                  />
                </div>
              </label>

              <button
                className="flex h-14 w-full items-center justify-center gap-4 rounded-full border border-zinc-200 bg-white px-5 text-base font-semibold text-black shadow-[0_14px_38px_rgba(15,23,42,0.08)] transition-[transform,box-shadow,opacity] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_46px_rgba(15,23,42,0.11)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                disabled={!canContinue}
                onClick={continueWithGoogle}
                type="button"
              >
                <GoogleMark />
                Continue with Google
              </button>
            </div>
          )}
        </div>
      </DialogContent>
      <CameraSheet
        open={cameraOpen}
        onCapture={(image) => setAvatarDataUrl(image.dataUrl)}
        onClose={() => setCameraOpen(false)}
        onUpload={() => {
          setCameraOpen(false)
          window.setTimeout(() => fileInputRef.current?.click(), 160)
        }}
      />
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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Invalid image file'))
        return
      }

      resolve(reader.result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

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
