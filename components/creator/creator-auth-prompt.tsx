import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { LoginDialog } from '@/components/app/app-shell'
import { Button } from '@/components/ui/button'
import { CreatorAuthSurface } from './creator-auth-surface'

export function CreatorAuthPrompt({ callbackUrl }: { callbackUrl: string }) {
  const [loginOpen, setLoginOpen] = useState(false)
  const [authDestination, setAuthDestination] = useState(callbackUrl)

  return (
    <>
      <CreatorAuthSurface>
        <div className="grid w-full gap-3">
          <Button className="h-12 rounded-full px-6" onClick={() => { setAuthDestination('/creator/setup?welcome=1'); setLoginOpen(true) }}>Create a new creator account<ArrowRight aria-hidden="true" /></Button>
          <Button variant="outline" className="h-12 rounded-full border-black/10 bg-white/80 px-6" onClick={() => { setAuthDestination(callbackUrl); setLoginOpen(true) }}>Sign in to existing account</Button>
        </div>
      </CreatorAuthSurface>
      <LoginDialog audience="creator" open={loginOpen} onOpenChange={setLoginOpen} callbackUrl={authDestination} />
    </>
  )
}
