import Link from 'next/link'
import { Anchor } from '@/components/ui/mogging-glyphs'
import { useReducedMotion } from 'motion/react'
import { SocialPlatformLogo } from '@/components/brand/social-platform-logo'
import { BorderBeam } from '@/components/ui/border-beam'
import { useTikTokAnchorSetup } from './tiktok-anchor-onboarding'
import { AnchorEarningsAnimation } from './anchor-earnings-animation'
import styles from './overview-bento.module.css'

export function CreatorAnchorTile() {
  const setup = useTikTokAnchorSetup()
  const reducedMotion = useReducedMotion()
  const beam = reducedMotion ? null : <BorderBeam size={45} duration={5} borderWidth={1.5} colorFrom="#25f4ee" colorTo="#fe2c55" />
  const account = setup?.account
  const action = account ? (account.tiktokAnchorJoinedAt ? 'View anchor setup' : 'Set up anchors') : 'Check eligibility'
  return (
    <section className={`${styles.tile} ${styles.anchors}`} aria-label="TikTok anchors">
      <div className={styles.topline}>
        <span><span className={styles.tiktokLogo}><SocialPlatformLogo platform="tiktok" /></span>TikTok anchors</span>
        <span className={styles.anchorAction} aria-hidden="true"><Anchor size={13} />{action}{beam}</span>
      </div>
      <div className={styles.anchorBody}>
        <div className={styles.anchorCopy}><h2 className={styles.anchorTitle}>Make your next<br />view go further.</h2><p className={styles.description}>Link straight to Mogging.<br />Earn bonuses on qualifying conversions.</p></div>
        <div className={styles.anchorArt}><AnchorEarningsAnimation /><span>{account?.tiktokAnchorJoinedAt ? 'Project joined' : 'TikTok · 1K+ followers'}</span></div>
      </div>
      {account
        ? <button type="button" className={styles.anchorTrigger} aria-label={action} aria-haspopup="dialog" onClick={setup?.open} />
        : <Link href="/creator/accounts" className={styles.anchorTrigger} aria-label="Check TikTok anchor eligibility" />}
    </section>
  )
}
