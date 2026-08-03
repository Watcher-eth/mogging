import { useEffect, useState, type FormEvent } from 'react'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { Check, Loader2, MessageCircle, ShieldCheck, WalletCards, Zap } from 'lucide-react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CreatorAuthPrompt } from '@/components/creator/creator-auth-prompt'
import { CreatorHeader, CreatorShell, Field, fieldClass } from '@/components/creator/creator-shell'
import type { CreatorDashboard } from '@/components/creator/types'
import { apiGet, apiPatch, ApiClientError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

const cryptoNetworks = ['USDC on Solana', 'BASE', 'Ethereum'] as const
const discordContactUrl = process.env.NEXT_PUBLIC_CREATOR_DISCORD_CONTACT_URL || 'https://discord.com/users/1526677788638056569'

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

  const selectedCryptoNetwork = cryptoNetworks.find((network) => network === cryptoNetwork) || 'Other'

  return (
    <>
      <CreatorHeader eyebrow="Payment Destination" title="Payout Information" description="Confirm your creator identity and choose where approved payments should be sent." action={<Button asChild variant="outline" className="h-11 rounded-full border-black/10 bg-white/80 px-5 text-[#0071e3] shadow-sm hover:bg-white"><a href={discordContactUrl} target="_blank" rel="noreferrer"><MessageCircle />Get Help on Discord</a></Button>} />
      {profile ? <div className="creator-surface mb-5 flex items-center gap-3 px-4 py-3 text-sm"><span className={cn('grid size-8 place-items-center rounded-full', profile.authStatus === 'verified' ? 'bg-[#e5f7ea] text-[#248a3d]' : 'bg-[#fff4ce] text-[#8a5a00]')}><Check className="size-4" /></span><div><p className="font-medium">{profile.authStatus === 'verified' ? 'Creator Verified' : 'Profile Received'}</p><p className="text-xs text-[#6e6e73]">{profile.authStatus === 'verified' ? 'Your creator access is verified.' : 'Your identity is saved and awaiting team verification.'}</p></div></div> : null}
      <form onSubmit={save} className="creator-surface grid gap-8 p-5 sm:p-7">
        <section className="grid gap-5">
          <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-zinc-100"><ShieldCheck className="size-4" /></span><div><h2 className="font-semibold tracking-[-0.025em]">Identity</h2><p className="text-xs text-zinc-500">Used by the Mogging creator team for payout records.</p></div></div>
          <div className="grid gap-5 sm:grid-cols-2"><Field label="Creator Name"><input className={fieldClass} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your creator name" required /></Field><Field label="Primary Contact"><input className={fieldClass} value={socialHandle} onChange={(event) => setSocialHandle(event.target.value)} placeholder="Phone number or @handle" /></Field></div>
        </section>
        <div className="h-px bg-zinc-100" />
        <section className="grid gap-5">
          <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-zinc-100"><WalletCards className="size-4" /></span><div><h2 className="font-semibold tracking-[-0.025em]">Payment Method</h2><p className="text-xs text-zinc-500">You can change this before a payment is processed.</p></div></div>
          <div className="flex items-start gap-2 rounded-[14px] bg-[#f5f5f7] px-3 py-2.5 text-xs leading-5 text-[#6e6e73]"><Zap className="mt-0.5 size-4 shrink-0 text-[#0071e3]" /><span><strong className="text-[#1d1d1f]">Crypto is the faster payout method.</strong> PayPal processing times may vary by region and account.</span></div>
          <div className="grid grid-cols-2 gap-2">{(['paypal', 'crypto'] as const).map((option) => <button key={option} type="button" onClick={() => setPaymentOption(option)} className={cn('flex items-center gap-3 rounded-[16px] border px-3 py-3 text-left text-sm font-medium transition-[border-color,background-color,box-shadow,transform] duration-150 active:scale-[0.98]', paymentOption === option ? 'border-[#0071e3]/35 bg-[#f2f7ff] text-[#0071e3] shadow-[0_0_0_3px_rgba(0,113,227,0.07)]' : 'border-black/[0.08] bg-white hover:bg-[#f5f5f7]')}><span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-black/[0.08] bg-white shadow-sm"><Image src={option === 'paypal' ? '/brands/paypal.png' : '/brands/usdc.svg'} alt="" width={option === 'paypal' ? 24 : 28} height={option === 'paypal' ? 24 : 28} /></span><span>{option === 'paypal' ? 'PayPal' : 'Crypto'}</span>{paymentOption === option ? <Check className="ml-auto size-4" /> : null}</button>)}</div>
          {paymentOption === 'paypal' ? <Field label="PayPal Email"><input className={fieldClass} type="email" value={paypalEmail} onChange={(event) => setPaypalEmail(event.target.value)} required /></Field> : <div className="grid gap-5 sm:grid-cols-2"><Field label="Network"><Select value={selectedCryptoNetwork} onValueChange={(value) => setCryptoNetwork(value === 'Other' ? '' : value)}><SelectTrigger aria-label="Crypto Network"><SelectValue placeholder="Choose a Network" /></SelectTrigger><SelectContent>{cryptoNetworks.map((network) => <SelectItem key={network} value={network}>{network}</SelectItem>)}<SelectItem value="Other">Other</SelectItem></SelectContent></Select></Field><Field label="Wallet Address"><input className={fieldClass} value={cryptoWalletAddress} onChange={(event) => setCryptoWalletAddress(event.target.value)} placeholder="Wallet address" required /></Field>{selectedCryptoNetwork === 'Other' ? <div className="sm:col-span-2"><Field label="Other Network"><input className={fieldClass} value={cryptoNetwork} onChange={(event) => setCryptoNetwork(event.target.value)} placeholder="Enter network name" required /></Field></div> : null}</div>}
        </section>
        <div className="flex justify-end"><Button className="h-11 rounded-full px-5" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : null}{profile ? 'Save Changes' : 'Save Payout Information'}</Button></div>
      </form>
    </>
  )
}
