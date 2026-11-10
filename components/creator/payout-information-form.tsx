import { creatorProfileSchema } from '@/lib/creator/validation'
import { useEffect, useState, type FormEvent } from 'react'
import Image from 'next/image'
import { Check, Info, Landmark, Loader2 } from 'lucide-react'
import useSWR, { useSWRConfig } from 'swr'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, fieldClass } from '@/components/creator/creator-shell'
import { creatorSetupStatusPath, type CreatorMoneyData, type CreatorProfile } from '@/components/creator/types'
import { canUseCreatorBankTransfer, creatorPaymentLabel } from '@/lib/creator/money'
import { apiGet, apiPatch, ApiClientError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

const cryptoNetworks = [
  { value: 'USDC on Solana', label: 'USDC on Solana', icon: '/brands/solana.png' },
  { value: 'BASE', label: 'USDC on Base', icon: '/brands/base.png' },
  { value: 'Ethereum', label: 'USDC on Ethereum', icon: '/brands/ethereum.png' },
] as const

export function PayoutInformation({ email, onSaved, embedded = false, dashboardKey = '/api/creator' }: { email: string; onSaved?: () => Promise<void>; embedded?: boolean; dashboardKey?: string }) {
  const { data, mutate } = useSWR<CreatorMoneyData>(dashboardKey, apiGet)
  const { mutate: revalidate } = useSWRConfig()
  const profile = data?.profile
  const [paymentOption, setPaymentOption] = useState<CreatorProfile['paymentOption']>('paypal')
  const [bankTransferDetails, setBankTransferDetails] = useState('')
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
    setBankTransferDetails(profile.bankTransferDetails || '')
  }, [email, profile])

  async function save(event: FormEvent) {
    event.preventDefault()
    const input = creatorProfileSchema.safeParse({ displayName: profile?.displayName || 'Creator', socialHandle: profile?.socialHandle, paymentOption, bankTransferDetails: paymentOption === 'bank_transfer' ? bankTransferDetails : null, paypalEmail: paymentOption === 'paypal' ? paypalEmail : null, paypalMeUrl: paymentOption === 'paypal' ? paypalMeUrl : null, cryptoNetwork: paymentOption === 'crypto' ? cryptoNetwork : null, cryptoWalletAddress: paymentOption === 'crypto' ? cryptoWalletAddress : null })
    if (!input.success) return toast.error(input.error.issues[0].message)
    setSaving(true)
    try {
      await apiPatch('/api/creator', input.data)
      await Promise.all([mutate(), revalidate(creatorSetupStatusPath)])
      toast.success('Payout information saved')
      await onSaved?.()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save payout information')
    } finally { setSaving(false) }
  }

  const selectedCryptoNetwork = cryptoNetworks.find((network) => network.value === cryptoNetwork)?.value || 'Other'
  const bankAvailable = Boolean(data && canUseCreatorBankTransfer(data.profile, data.submissions, data.payments))
  const options: CreatorProfile['paymentOption'][] = bankAvailable ? ['paypal', 'crypto', 'bank_transfer'] : ['paypal', 'crypto']

  return (
      <form onSubmit={save} className={cn('grid gap-8', !embedded && 'creator-surface p-5 sm:p-7')}>
        <section className="grid gap-5">
          <div className="grid grid-cols-2 gap-2">{options.map((option) => <button key={option} type="button" onClick={() => setPaymentOption(option)} className={cn('creator-selection flex items-center gap-3 border text-left text-sm font-medium active:scale-[0.98]', option === 'bank_transfer' && 'col-span-2', paymentOption === option ? 'creator-choice-selected' : 'border-black/[0.08] bg-white hover:bg-[#f7f8f9]')}><span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-black/[0.08] bg-white shadow-sm">{option === 'bank_transfer' ? <Landmark className="size-5" /> : <Image src={option === 'paypal' ? '/brands/paypal.png' : '/brands/usdc.svg'} alt="" width={option === 'paypal' ? 24 : 28} height={option === 'paypal' ? 24 : 28} />}</span><span>{creatorPaymentLabel(option)}</span>{option === 'bank_transfer' ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-900">High fees</span> : null}{paymentOption === option ? <Check className="ml-auto size-4" /> : null}</button>)}</div>
          <aside role="note" className="creator-info-bubble">
            <Info aria-hidden="true" className="size-8 shrink-0" fill="white" stroke="#202123" strokeWidth={1.7} />
            {paymentOption === 'bank_transfer' ? <p><strong>Bank transfers have higher fees.</strong> Our team will confirm the transfer details and fees before paying you.</p> : <p><strong>Crypto is the faster payout method.</strong> PayPal processing times may vary by region and account.</p>}
          </aside>
          {paymentOption === 'bank_transfer' ? <Field label="Bank transfer details"><textarea className={cn(fieldClass, 'min-h-40 resize-y')} value={bankTransferDetails} onChange={event => setBankTransferDetails(event.target.value)} minLength={20} maxLength={1500} required placeholder="Account holder, bank name, country, payout currency, IBAN or account number, and SWIFT or routing code" /><p className="mt-2 text-xs leading-5 text-zinc-500">Use your receiving account details. Never include a password, PIN or card details.</p></Field> : paymentOption === 'paypal' ? <div className="grid gap-5 sm:grid-cols-2"><Field label="PayPal Email"><input className={fieldClass} type="email" value={paypalEmail} onChange={(event) => setPaypalEmail(event.target.value)} required /></Field><Field label="PayPal.Me Link (optional)"><input className={fieldClass} type="url" value={paypalMeUrl} maxLength={2048} onChange={(event) => setPaypalMeUrl(event.target.value)} placeholder="https://paypal.me/yourname" /></Field></div> : <div className="grid gap-5 sm:grid-cols-2"><Field label="Network"><Select value={selectedCryptoNetwork} onValueChange={(value) => setCryptoNetwork(value === 'Other' ? '' : value)}><SelectTrigger aria-label="Crypto Network" className="[&>span]:flex [&>span]:min-w-0 [&>span]:items-center [&>span]:text-left"><SelectValue placeholder="Choose a Network" /></SelectTrigger><SelectContent className="creator-select-content">{cryptoNetworks.map((network) => <SelectItem key={network.value} value={network.value}><span className="inline-flex items-center gap-2"><Image src={network.icon} alt="" width={20} height={20} className="size-5 shrink-0 rounded-full object-contain" />{network.label}</span></SelectItem>)}<SelectItem value="Other">Other</SelectItem></SelectContent></Select></Field><Field label="Wallet Address"><input className={fieldClass} maxLength={180} value={cryptoWalletAddress} onChange={(event) => setCryptoWalletAddress(event.target.value)} placeholder="Wallet address" required /></Field>{selectedCryptoNetwork === 'Other' ? <div className="sm:col-span-2"><Field label="Other Network"><input className={fieldClass} value={cryptoNetwork} onChange={(event) => setCryptoNetwork(event.target.value)} placeholder="Enter network name" required /></Field></div> : null}</div>}
        </section>
        <div className="creator-actions grid gap-3"><Button className="h-11 w-full justify-self-end rounded-full px-5 sm:w-auto" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : null}{onSaved ? 'Finish setup' : profile ? 'Save Changes' : 'Save Payout Information'}</Button><p className="text-xs leading-5 text-zinc-500 sm:text-right">Reviews can take up to 72 hours. Please comply with any requests made during review to receive your payment.</p></div>
      </form>

  )
}
