import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { LoginDialog } from '@/components/app/app-shell'
import { Button } from '@/components/ui/button'
import { CreatorAuthSurface } from './creator-auth-surface'

export function CreatorAuthPrompt({ callbackUrl }: { callbackUrl: string }) {
  const [loginOpen, setLoginOpen] = useState(true)

  return (
    <>
      <CreatorAuthSurface>
        <Button className="h-11 rounded-full px-6" onClick={() => setLoginOpen(true)}>Sign in<ArrowUpRight aria-hidden="true" /></Button>
      </CreatorAuthSurface>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} callbackUrl={callbackUrl} />
    </>
  )
}
