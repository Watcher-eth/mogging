import { useTranslation } from 'react-i18next'
import { PublicFooter } from '@/components/app/public-footer'
import { SkeletonAvatar } from '@/components/ui/skeleton-avatar'
import motionStyles from '@/components/ui/surface-motion.module.css'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/router'
import { ChevronDown, FileText, Loader2, LogOut, Pencil, Plus } from 'lucide-react'
import useSWR from 'swr'
import useSWRImmutable from 'swr/immutable'
import { AppHeader } from '@/components/app/app-header'
import { LoginDialog } from '@/components/app/login-dialog'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { apiGet, ApiClientError } from '@/lib/api/client'
import type { HairColor, SkinColor } from '@/lib/appearance/types'
import { toast } from 'sonner'
const SidebarProvider = dynamic(() => import('@/components/ui/sidebar').then(module => module.SidebarProvider))
const EditProfileDialog = dynamic(() => import('./profile-dialogs').then(module => module.EditProfileDialog))
const ProfileSetupDialog = dynamic(() => import('./profile-dialogs').then(module => module.ProfileSetupDialog))
const AnonymousProfileDialog = dynamic(() => import('./profile-dialogs').then(module => module.AnonymousProfileDialog))

type AppShellProps = {
  children: ReactNode
}

export type CurrentUserDashboard = {
  user: {
    id: string
    name: string | null
    email?: string | null
    image: string | null
    instagramUsername: string | null
    gender: 'male' | 'female' | null
    age: number | null
    hairColor: HairColor | null
    skinColor: SkinColor | null
    country: string | null
    state: string | null
    profileCompleted: boolean
  }
  recentAnalyses: Array<{
    id: string
    status: 'pending' | 'processing' | 'complete' | 'failed'
  }>
}

type AppConfig = {
  features: {
    authRequired: boolean
    paidAnalysisRequired: boolean
  }
}

export type AnonymousProfile = {
  id: string
  anonymousActorId: string
  name: string
  image: string | null
  social: string | null
  gender: 'male' | 'female' | null
  age: number | null
  hairColor: HairColor | null
  skinColor: SkinColor | null
  country: string | null
  state: string | null
}

export function AppShell({ children }: AppShellProps) {
  const { t } = useTranslation()
  const { data: session, status } = useSession()
  const router = useRouter()
  const homepage = router.pathname === '/'
  const Content = homepage ? 'div' : 'main'
  const pendingAuthRedirect = getSafeAuthRedirect(router.query.next)
  const memberPreview = process.env.NODE_ENV === 'development' && router.pathname === '/__member-preview'
  const creatorRoute = router.pathname === '/creator' || router.pathname.startsWith('/creator/')
  const creatorSetup = router.pathname === '/creator/setup'
  const creatorSupport = router.pathname === '/creator/support' || router.pathname === '/creator/__support-demo'
  const creatorReferral = router.pathname === '/r/[slug]'
  const creatorSignIn = router.pathname.startsWith('/creator') && status === 'unauthenticated'
  const pwaHome = router.pathname === '/app/home'
  const pwaScan = router.pathname === '/analysis' && router.query.from === 'app'
  const paidAnalysis = router.pathname === '/analysis' && (router.query.checkout === 'success' || Boolean(router.query.analysisId))
  const immersive = pwaHome || router.pathname === '/__analysis-v2-report-preview' || router.pathname === '/' || router.pathname === '/analysis' || router.pathname === '/leaderboard' || router.pathname === '/battle' || router.pathname === '/app' || router.pathname === '/app/handoff'
  const [loginOpen, setLoginOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [anonymousProfileOpen, setAnonymousProfileOpen] = useState(false)
  const [profileSetupOpen, setProfileSetupOpen] = useState(false)
  const profileDialogOpen = editOpen || anonymousProfileOpen || (profileSetupOpen && !creatorRoute && !creatorReferral)
  const [profileDialogsRequested, setProfileDialogsRequested] = useState(false)
  useEffect(() => {
    if (profileDialogOpen) setProfileDialogsRequested(true)
  }, [profileDialogOpen])
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const dismissedProfileSetupRef = useRef(false)
  const accountRef = useRef<HTMLDivElement | null>(null)
  const showHeader = !creatorRoute && !creatorReferral && !pwaHome
  const { data: dashboard, mutate: mutateDashboard } = useSWR<CurrentUserDashboard>(
    status === 'authenticated' && session?.user?.id && showHeader ? ['/api/user/me?view=shell', session.user.id] : null,
    ([url]: [string, string]) => apiGet(url),
    {
      revalidateOnFocus: true,
      shouldRetryOnError: false,
    }
  )
  const { data: memberAccess } = useSWR<{ entitlements: { subscription: { active: boolean; tier?: 'basic' | 'pro' } } }>(
    status === 'authenticated' && session?.user?.id && showHeader
      ? ['/api/payments/navigation-membership', session.user.id] : null,
    ([url]: [string, string]) => apiGet(url),
    { shouldRetryOnError: false },
  )
  const membership = memberAccess?.entitlements.subscription
  const { data: appConfig } = useSWRImmutable<AppConfig>(showHeader ? '/api/app-config' : null, apiGet, {
    shouldRetryOnError: false,
  })
  const authRequired = appConfig?.features.authRequired ?? false
  const { data: anonymousProfileData, mutate: mutateAnonymousProfile } = useSWR<{ profile: AnonymousProfile | null }>(
    showHeader && status === 'unauthenticated' && appConfig && !authRequired ? '/api/auth/anonymous-profile' : null,
    apiGet,
    {
      shouldRetryOnError: false,
    }
  )

  useEffect(() => {
    if (pwaHome || pwaScan || paidAnalysis || creatorRoute || status !== 'authenticated' || !dashboard?.user || dismissedProfileSetupRef.current) return
    if (dashboard.user.profileCompleted) return

    setLoginOpen(false)
    setProfileSetupOpen(true)
  }, [creatorRoute, dashboard?.user, paidAnalysis, pwaHome, pwaScan, status])

  useEffect(() => {
    if (!router.isReady || router.query.login !== '1') return

    if (status === 'unauthenticated') {
      setLoginOpen(true)
      return
    }

    if (status === 'authenticated' && pendingAuthRedirect) {
      setLoginOpen(false)
      void router.replace(pendingAuthRedirect)
    }
  }, [pendingAuthRedirect, router, router.isReady, router.query.login, status])

  useEffect(() => {
    if (!accountOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!accountRef.current?.contains(event.target as Node)) {
        setAccountOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [accountOpen])

  const profileUser = dashboard?.user ?? session?.user
  const profileName = profileUser?.name || session?.user?.email || 'Profile'
  const profileImage = profileUser?.image || session?.user?.image || null
  const latestCompleteAnalysis = dashboard?.recentAnalyses?.find((analysis) => analysis.status === 'complete') ?? null

  async function openLatestAnalysis() {
    if (!latestCompleteAnalysis) {
      toast.error('No completed analysis found')
      return
    }

    setAnalysisLoading(true)
    try {
      setAccountOpen(false)
      void router.push(`/analysis?analysisId=${encodeURIComponent(latestCompleteAnalysis.id)}`)
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Unable to open your analysis')
    } finally {
      setAnalysisLoading(false)
    }
  }

  return (
    <div data-analysis-shell={router.pathname === '/analysis' || undefined} className={creatorRoute ? 'creator-app flex min-h-dvh flex-col' : immersive ? 'min-h-screen bg-white' : 'min-h-screen bg-background'}>
      {showHeader ? <AppHeader member={memberPreview || membership?.active === true} newMemberFeatures={memberPreview || membership?.tier === 'pro'}>
            {status === 'loading' ? (
              <div className="h-8 w-14 animate-pulse rounded-lg border border-zinc-200 bg-white sm:h-10 sm:w-24" />
            ) : session?.user ? (
              <div ref={accountRef} className="relative">
                <Button
                  className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-xs font-medium text-black shadow-none hover:bg-zinc-50 sm:h-10 sm:rounded-xl sm:px-3 sm:text-sm"
                  variant="outline"
                  size="sm"
                  onClick={() => setAccountOpen((current) => !current)}
                >
                  <SkeletonAvatar unoptimized={false} src={profileImage} alt="" size={24} fallback={profileName.slice(0, 1)} className="size-5 rounded-full bg-zinc-100 text-[10px] uppercase text-black/70 sm:size-6 sm:text-[11px]" />
                  <span className="hidden max-w-28 truncate sm:inline">{profileName}</span>
                  <ChevronDown className="size-3.5 text-zinc-500" aria-hidden="true" />
                </Button>

                {accountOpen ? (
                  <div className={`${motionStyles.popover} absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 rounded-[24px] border border-zinc-200 bg-white p-2 text-black shadow-[0_22px_70px_rgba(15,23,42,0.16)]`}>
                    <div className="flex items-center gap-3 border-b border-zinc-100 px-2 py-3">
                      <SkeletonAvatar unoptimized={false} src={profileImage} alt="" size={40} fallback={profileName.slice(0, 1)} className="size-10 rounded-full bg-zinc-100 text-sm font-semibold uppercase text-black/70" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold tracking-[-0.03em]">{profileName}</p>
                        <p className="mt-0.5 truncate text-xs text-zinc-500">{dashboard?.user.instagramUsername || session.user.email || 'Signed in'}</p>
                      </div>
                    </div>
                    <AccountMenuButton
                      icon={<Pencil className="size-4" aria-hidden="true" />}
                      onClick={() => {
                        setEditOpen(true)
                        setAccountOpen(false)
                      }}
                    >
                      Edit user name and social link
                    </AccountMenuButton>
                    <AccountMenuButton
                      disabled={!latestCompleteAnalysis || analysisLoading}
                      icon={analysisLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileText className="size-4" aria-hidden="true" />}
                      onClick={() => void openLatestAnalysis()}
                    >
                      Your Analysis
                    </AccountMenuButton>
                    <AccountMenuButton
                      icon={<LogOut className="size-4" aria-hidden="true" />}
                      onClick={() => signOut({ callbackUrl: '/' })}
                    >
                      Logout
                    </AccountMenuButton>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {!authRequired ? (
                  <Button
                    className="size-8 rounded-lg border border-zinc-300 bg-white p-0 text-black shadow-none hover:bg-zinc-50 sm:size-10 sm:rounded-xl"
                    variant="outline"
                    size="icon"
                    onClick={() => setAnonymousProfileOpen(true)}
                    aria-label="Set anonymous profile"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                  </Button>
                ) : null}
                <Button
                  className="h-8 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-black shadow-none hover:bg-zinc-50 sm:h-10 sm:rounded-xl sm:px-5 sm:text-sm"
                  variant="outline"
                  size="sm"
                  onClick={() => setLoginOpen(true)}
                >
                  {t('signIn')}
                </Button>
              </div>
            )}
      </AppHeader> : null}

      <Content className={creatorSignIn || creatorSetup || creatorReferral ? 'flex w-full flex-1 flex-col' : creatorRoute ? 'mx-auto flex w-full max-w-[var(--workspace-max)] flex-1 flex-col' : immersive ? 'w-full' : 'public-frame public-gutters py-8'}>
        {creatorRoute && !creatorSignIn && !creatorSetup ? <SidebarProvider className="min-h-0 flex-1 flex-col">{children}</SidebarProvider> : children}
      </Content>

      {!homepage && !creatorSetup && !creatorReferral && !creatorSupport && !pwaHome ? <PublicFooter /> : null}

      <LoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        callbackUrl={pendingAuthRedirect ?? router.asPath ?? '/'}
      />
      {profileDialogsRequested || profileDialogOpen ? <>
      <EditProfileDialog
        dashboard={dashboard ?? null}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => mutateDashboard()}
      />
      <AnonymousProfileDialog
        open={anonymousProfileOpen}
        onOpenChange={setAnonymousProfileOpen}
        profile={anonymousProfileData?.profile ?? null}
        onSaved={() => mutateAnonymousProfile()}
      />
      <ProfileSetupDialog
        dashboard={dashboard ?? null}
        open={profileSetupOpen && !creatorRoute && !creatorReferral && !pwaHome && !pwaScan && !paidAnalysis}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) dismissedProfileSetupRef.current = true
          setProfileSetupOpen(nextOpen)
        }}
        onSaved={() => {
          dismissedProfileSetupRef.current = true
          return mutateDashboard()
        }}
      />
      </> : null}
    </div>
  )
}

function getSafeAuthRedirect(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null
  return next
}

function AccountMenuButton({
  children,
  disabled,
  icon,
  onClick,
}: {
  children: ReactNode
  disabled?: boolean
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-medium text-black transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-700">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </button>
  )
}
