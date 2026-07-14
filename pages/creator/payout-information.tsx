import { useEffect, useState, type FormEvent } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { Check, Loader2, LogOut, ShieldCheck, WalletCards, Zap } from 'lucide-react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CreatorAuthPrompt } from '@/components/creator/creator-auth-prompt'
import { CreatorHeader, CreatorShell, Field, fieldClass } from '@/components/creator/creator-shell'
import type { CreatorDashboard } from '@/components/creator/types'
import { apiGet, apiPatch, ApiClientError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

export default function CreatorPayoutInformationPage() {
  const { data: session, status } = useSession()
  return (
    <CreatorShell allowUnauthenticated>
      {status === 'unauthenticated' ? <CreatorAuthPrompt callbackUrl="/creator/payout-information" /> : status === 'authenticated' ? <PayoutInformation email={session.user?.email || ''} /> : null}
    </CreatorShell>
  )
}

function PayoutInformation({ email }: { email: string }) {
  const { data, mutate } = useSWR<CreatorDashboard>('/api/creator', apiGet)
  const profile = data?.profile
  const [displayName, setDisplayName] = useState('')
  const [socialHandle, setSocialHandle] = useState('')
  const [paymentOption, setPaymentOption] = useState<'paypal' | 'crypto'>('paypal')
  const [paypalEmail, setPaypalEmail] = useState(email)
  const [cryptoNetwork, setCryptoNetwork] = useState('USDC on Solana')
  const [cryptoWalletAddress, setCryptoWalletAddress] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.displayName)
    setSocialHandle(profile.socialHandle || '')
    setPaymentOption(profile.paymentOption)
    setPaypalEmail(profile.paypalEmail || email)
    setCryptoNetwork(profile.cryptoNetwork || 'USDC on Solana')
    setCryptoWalletAddress(profile.cryptoWalletAddress || '')
  }, [email, profile])

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await apiPatch('/api/creator', { displayName, socialHandle, paymentOption, paypalEmail: paypalEmail || null, cryptoNetwork: cryptoNetwork || null, cryptoWalletAddress: cryptoWalletAddress || null })
      await mutate()
      toast.success('Payout information saved')
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save payout information')
    } finally { setSaving(false) }
  }

  return (
    <>
      <CreatorHeader eyebrow="Payment destination" title="Payout information" description="Confirm your creator identity and choose where approved payments should be sent." action={<Button variant="outline" className="h-10 rounded-xl" onClick={() => signOut({ callbackUrl: '/creator/accounts' })}><LogOut />Sign out</Button>} />
      {profile ? <div className="mb-5 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"><span className={cn('grid size-8 place-items-center rounded-full', profile.authStatus === 'verified' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}><Check className="size-4" /></span><div><p className="font-medium">{profile.authStatus === 'verified' ? 'Creator verified' : 'Profile received'}</p><p className="text-xs text-zinc-500">{profile.authStatus === 'verified' ? 'Your creator access is verified.' : 'Your identity is saved and awaiting team verification.'}</p></div></div> : null}
      <form onSubmit={save} className="grid gap-8 rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.05)] sm:p-8">
        <section className="grid gap-5">
          <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-zinc-100"><ShieldCheck className="size-4" /></span><div><h2 className="font-semibold tracking-[-0.025em]">Identity</h2><p className="text-xs text-zinc-500">Used by the Mogging creator team for payout records.</p></div></div>
          <div className="grid gap-5 sm:grid-cols-2"><Field label="Creator name"><input className={fieldClass} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your creator name" required /></Field><Field label="Primary social"><input className={fieldClass} value={socialHandle} onChange={(event) => setSocialHandle(event.target.value)} placeholder="@handle or profile URL" /></Field></div>
        </section>
        <div className="h-px bg-zinc-100" />
        <section className="grid gap-5">
          <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-zinc-100"><WalletCards className="size-4" /></span><div><h2 className="font-semibold tracking-[-0.025em]">Payment method</h2><p className="text-xs text-zinc-500">You can change this before a payment is processed.</p></div></div>
          <div className="flex items-start gap-2 rounded-xl bg-zinc-50 px-3 py-2.5 text-xs leading-5 text-zinc-600"><Zap className="mt-0.5 size-4 shrink-0 text-black" /><span><strong className="text-black">Crypto is the faster payout method.</strong> PayPal processing times may vary by region and account.</span></div>
          <div className="grid grid-cols-2 gap-2">{(['paypal', 'crypto'] as const).map((option) => <button key={option} type="button" onClick={() => setPaymentOption(option)} className={cn('rounded-xl border px-4 py-3 text-left text-sm font-medium transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.98]', paymentOption === option ? 'border-black bg-black text-white' : 'border-zinc-200 bg-white hover:bg-zinc-50')}>{option === 'paypal' ? 'PayPal' : 'Crypto'}</button>)}</div>
          {paymentOption === 'paypal' ? <Field label="PayPal email"><input className={fieldClass} type="email" value={paypalEmail} onChange={(event) => setPaypalEmail(event.target.value)} required /></Field> : <div className="grid gap-5 sm:grid-cols-2"><Field label="Network"><input className={fieldClass} value={cryptoNetwork} onChange={(event) => setCryptoNetwork(event.target.value)} placeholder="USDC on Solana" required /></Field><Field label="Wallet address"><input className={fieldClass} value={cryptoWalletAddress} onChange={(event) => setCryptoWalletAddress(event.target.value)} placeholder="Wallet address" required /></Field></div>}
        </section>
        <div className="flex justify-end"><Button className="h-11 rounded-xl px-5" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : null}{profile ? 'Save changes' : 'Save payout information'}</Button></div>
      </form>
    </>
  )
}
