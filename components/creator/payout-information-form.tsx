import { creatorProfileSchema } from '@/lib/creator/validation'
import { useEffect, useState, type FormEvent } from 'react'
import Image from 'next/image'
import { Check, Loader2, MessageCircle, Zap } from 'lucide-react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { AccountReviewNote, discordContactUrl } from '@/components/creator/content-guidelines'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, fieldClass } from '@/components/creator/creator-shell'
import { CreatorIcon, CreatorStatusIcon } from '@/components/creator/creator-icon'
import type { CreatorDashboard } from '@/components/creator/types'
import { apiGet, apiPatch, ApiClientError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

const cryptoNetworks = [
  { value: 'USDC on Solana', label: 'USDC on Solana', icon: '/brands/solana.png' },
  { value: 'BASE', label: 'USDC on Base', icon: '/brands/base.png' },
  { value: 'Ethereum', label: 'USDC on Ethereum', icon: '/brands/ethereum.png' },
] as const

export function PayoutInformation({ email, onSaved, embedded = false }: { email: string; onSaved?: () => Promise<void>; embedded?: boolean }) {
  const { data, mutate } = useSWR<CreatorDashboard>('/api/creator', apiGet)
  const profile = data?.profile
  const [paymentOption, setPaymentOption] = useState<'paypal' | 'crypto'>('paypal')
  const [paypalEmail, setPaypalEmail] = useState(email)
  const [paypalMeUrl, setPaypalMeUrl] = useState('')
  const [cryptoNetwork, setCryptoNetwork] = useState('USDC on Solana')
  const [cryptoWalletAddress, setCryptoWalletAddress] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    setPaymentOption(profile.paymentOption)
    setPaypalEmail(profile.paypalEmail || email)
    setPaypalMeUrl(profile.paypalMeUrl || '')
    setCryptoNetwork(profile.cryptoNetwork || 'USDC on Solana')
    setCryptoWalletAddress(profile.cryptoWalletAddress || '')
  }, [email, profile])

  async function save(event: FormEvent) {
    event.preventDefault()
    const input = creatorProfileSchema.safeParse({ displayName: profile?.displayName || 'Creator', socialHandle: profile?.socialHandle, paymentOption, paypalEmail: paymentOption === 'paypal' ? paypalEmail : null, paypalMeUrl: paymentOption === 'paypal' ? paypalMeUrl : null, cryptoNetwork: paymentOption === 'crypto' ? cryptoNetwork : null, cryptoWalletAddress: paymentOption === 'crypto' ? cryptoWalletAddress : null })
    if (!input.success) return toast.error(input.error.issues[0].message)
    setSaving(true)
    try {
      await apiPatch('/api/creator', input.data)
      await mutate()
      toast.success('Payout information saved')
      await onSaved?.()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save payout information')
    } finally { setSaving(false) }
  }

  const selectedCryptoNetwork = cryptoNetworks.find((network) => network.value === cryptoNetwork)?.value || 'Other'

  return (
    <>

      {!embedded && profile ? <div className="mb-4 flex items-center gap-3 text-sm"><CreatorStatusIcon name="payouts" verified={profile.authStatus === 'verified'} /><div><p className="font-medium">{profile.authStatus === 'verified' ? 'Payment Method Approved' : 'Payout Information'}</p><p className="text-xs text-[#73777d]">{profile.authStatus === 'verified' ? 'Your payment destination is approved.' : (profile.paymentOption === 'paypal' ? profile.paypalEmail : profile.cryptoNetwork && profile.cryptoWalletAddress) ? 'Your payment destination is awaiting review.' : 'Add a payment destination to receive earnings.'}</p></div></div> : null}
      <form onSubmit={save} className={cn('grid gap-8', !embedded && 'creator-surface p-5 sm:p-7')}>
        <section className="grid gap-5">
          <div className="flex items-center gap-3"><CreatorIcon name="payouts" className="size-11" /><div><h2 className="font-semibold tracking-[-0.025em]">Payment Method</h2><p className="text-xs text-zinc-500">You can change this before a payment is processed.</p></div></div>
          <div className="flex items-start gap-2 rounded-[14px] bg-[#f7f8f9] px-3 py-2.5 text-xs leading-5 text-[#73777d]"><Zap className="mt-0.5 size-4 shrink-0 text-[#00A8EF]" /><span><strong className="text-[#181a1d]">Crypto is the faster payout method.</strong> PayPal processing times may vary by region and account.</span></div>
          <div className="grid grid-cols-2 gap-2">{(['paypal', 'crypto'] as const).map((option) => <button key={option} type="button" onClick={() => setPaymentOption(option)} className={cn('flex items-center gap-3 rounded-[16px] border px-3 py-3 text-left text-sm font-medium transition-[border-color,background-color,box-shadow,transform] duration-150 active:scale-[0.98]', paymentOption === option ? 'creator-choice-selected' : 'border-black/[0.08] bg-white hover:bg-[#f7f8f9]')}><span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-black/[0.08] bg-white shadow-sm"><Image src={option === 'paypal' ? '/brands/paypal.png' : '/brands/usdc.svg'} alt="" width={option === 'paypal' ? 24 : 28} height={option === 'paypal' ? 24 : 28} /></span><span>{option === 'paypal' ? 'PayPal' : 'Crypto'}</span>{paymentOption === option ? <Check className="ml-auto size-4" /> : null}</button>)}</div>
          {paymentOption === 'paypal' ? <div className="grid gap-5 sm:grid-cols-2"><Field label="PayPal Email"><input className={fieldClass} type="email" value={paypalEmail} onChange={(event) => setPaypalEmail(event.target.value)} required /></Field><Field label="PayPal.Me Link (optional)"><input className={fieldClass} type="url" value={paypalMeUrl} maxLength={2048} onChange={(event) => setPaypalMeUrl(event.target.value)} placeholder="https://paypal.me/yourname" /></Field></div> : <div className="grid gap-5 sm:grid-cols-2"><Field label="Network"><Select value={selectedCryptoNetwork} onValueChange={(value) => setCryptoNetwork(value === 'Other' ? '' : value)}><SelectTrigger aria-label="Crypto Network" className="[&>span]:flex [&>span]:min-w-0 [&>span]:items-center [&>span]:text-left"><SelectValue placeholder="Choose a Network" /></SelectTrigger><SelectContent className="creator-select-content">{cryptoNetworks.map((network) => <SelectItem key={network.value} value={network.value}><span className="inline-flex items-center gap-2"><Image src={network.icon} alt="" width={20} height={20} className="size-5 shrink-0 rounded-full object-contain" />{network.label}</span></SelectItem>)}<SelectItem value="Other">Other</SelectItem></SelectContent></Select></Field><Field label="Wallet Address"><input className={fieldClass} maxLength={180} value={cryptoWalletAddress} onChange={(event) => setCryptoWalletAddress(event.target.value)} placeholder="Wallet address" required /></Field>{selectedCryptoNetwork === 'Other' ? <div className="sm:col-span-2"><Field label="Other Network"><input className={fieldClass} value={cryptoNetwork} onChange={(event) => setCryptoNetwork(event.target.value)} placeholder="Enter network name" required /></Field></div> : null}</div>}
        </section>
        <div className="creator-actions flex justify-end"><Button className="h-11 rounded-full px-5" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : null}{onSaved ? 'Finish setup' : profile ? 'Save Changes' : 'Save Payout Information'}</Button></div>
      </form>
      <div className="mt-5"><AccountReviewNote /></div>
      <Button asChild variant="outline" className="h-11 rounded-full border-black/10 bg-white/80 px-5 text-[#00A8EF] shadow-sm hover:bg-white"><a href={discordContactUrl} target="_blank" rel="noreferrer"><MessageCircle />Get Help on Discord</a></Button>
    </>
  )
}
