import { useState } from 'react'
import { LogIn, ShieldCheck } from 'lucide-react'
import { LoginDialog } from '@/components/app/app-shell'
import { Button } from '@/components/ui/button'

export function CreatorAuthPrompt({ callbackUrl }: { callbackUrl: string }) {
  const [loginOpen, setLoginOpen] = useState(true)

  return (
    <>
      <div className="creator-surface flex min-h-[52vh] w-full items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <span className="mx-auto grid size-12 place-items-center rounded-[16px] bg-[#e8f2ff] text-[#0071e3]"><ShieldCheck className="size-5" /></span>
          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.055em]">Creator authentication</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-500">Sign in with your Mogging account to connect creator accounts, submit videos, and manage payouts.</p>
          <Button className="mt-7 h-11 rounded-full px-5" onClick={() => setLoginOpen(true)}><LogIn />Open Sign In</Button>
        </div>
      </div>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} callbackUrl={callbackUrl} />
    </>
  )
}
