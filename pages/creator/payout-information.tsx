import { useSession } from 'next-auth/react'
import { CreatorAuthPrompt } from '@/components/creator/creator-auth-prompt'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import { PayoutInformation } from '@/components/creator/payout-information-form'

export default function CreatorPayoutInformationPage() {
  const { data: session, status } = useSession()
  return (
    <CreatorShell allowUnauthenticated>
      {status === 'unauthenticated' ? <CreatorAuthPrompt callbackUrl="/creator/payout-information" /> : status === 'authenticated' ? <><CreatorHeader eyebrow="Payment Destination" title="Payout Information" description="Choose where to receive your approved earnings." /><PayoutInformation email={session.user?.email || ''} /></> : null}
    </CreatorShell>
  )
}

