import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import { identifyWebAnalytics, trackWebPage } from '@/lib/analytics/client'

export function Analytics() {
  const router = useRouter()
  const { data: session, status } = useSession()
  useEffect(() => {
    if (status !== 'loading') identifyWebAnalytics(session?.user?.id)
  }, [session?.user?.id, status])
  useEffect(() => {
    if (router.isReady) trackWebPage(router.pathname)
  }, [router.isReady, router.pathname])
  return null
}
