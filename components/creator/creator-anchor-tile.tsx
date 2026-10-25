import { useState } from 'react'
import Link from 'next/link'
import { Anchor } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { SocialPlatformLogo } from '@/components/brand/social-platform-logo'
import { BorderBeam } from '@/components/ui/border-beam'
import { tiktokAnchorEligible } from '@/lib/creator/tiktok-anchor'
import type { CreatorSocialAccount } from './types'
import { TikTokAccountDialog } from './tiktok-anchor-onboarding'
import { AnchorEarningsAnimation } from './anchor-earnings-animation'
import styles from './overview-bento.module.css'

export function CreatorAnchorTile({ accounts, onAccountSaved }: { accounts: CreatorSocialAccount[]; onAccountSaved: () => Promise<unknown> }) {
  const reducedMotion = useReducedMotion()
  const beam = reducedMotion ? null : <BorderBeam size={45} duration={5} borderWidth={1.5} colorFrom="#25f4ee" colorTo="#fe2c55" />
  const eligible = accounts.filter(account => tiktokAnchorEligible(account) === true)
  const anchorAccount = eligible.find(account => !account.tiktokAnchorJoinedAt) || eligible[0]
  const [setupAccountId, setSetupAccountId] = useState<string | null>(null)
  const setupAccount = accounts.find(account => account.id === setupAccountId)
  return <>
    <section className={`${styles.tile} ${styles.anchors}`} aria-label="TikTok anchors">
      <div className={styles.topline}>
        <span><span className={styles.tiktokLogo}><SocialPlatformLogo platform="tiktok" /></span>TikTok anchors</span>
        {anchorAccount ? <button type="button" onClick={() => setSetupAccountId(anchorAccount.id)} className={styles.anchorAction}><Anchor size={13} aria-hidden="true" />{anchorAccount.tiktokAnchorJoinedAt ? 'View anchor setup' : 'Set up anchors'}{beam}</button> : <Link href="/creator/accounts" className={styles.anchorAction}><Anchor size={13} aria-hidden="true" />Check eligibility{beam}</Link>}
      </div>
      <div className={styles.anchorBody}>
      <div className={styles.anchorCopy}><h2 className={styles.anchorTitle}>Make your next<br />view go further.</h2><p className={styles.description}>Link straight to Mogging.<br />Earn bonuses on qualifying conversions.</p></div>
      <div className={styles.anchorArt}><AnchorEarningsAnimation /><span>{anchorAccount?.tiktokAnchorJoinedAt ? 'Project joined' : 'TikTok · 1K+ followers'}</span></div>
      </div>
    </section>
    {setupAccount ? <TikTokAccountDialog key={setupAccount.id} account={setupAccount} mode="anchor" open onOpenChange={open => { if (!open) setSetupAccountId(null) }} onSaved={onAccountSaved} /> : null}
  </>
}
