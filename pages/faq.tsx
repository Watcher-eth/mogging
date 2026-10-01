import Link from 'next/link'
import { GuidePage } from '@/components/app/guide-page'

export default function FaqPage() {
  return (
    <GuidePage title="Frequently asked questions" description="Learn what the Mogging app does, how to interpret face analysis scores, and where to get help." path="/faq">
      <section>
        <h2>What does the Mogging app do?</h2>
        <p>Mogging turns a face photo into a comprehensive report with feature breakdowns. The mobile app brings reports, personalized routines, and evaluation history together. You can also try <Link href="/analysis">face analysis on the web</Link>, explore <Link href="/battle">mog battles</Link>, or view the <Link href="/leaderboard">leaderboard</Link>.</p>
      </section>
      <section>
        <h2>How should I interpret a photo-based score?</h2>
        <p>A photo-based score is an estimate influenced by lighting, pose, and image quality. It is not a diagnosis or an objective measure of your attractiveness. Repeated photos are most useful when taken under similar conditions.</p>
        <p><Link href="/how-face-analysis-works">Read how our face analysis works and its limitations.</Link></p>
      </section>
      <section>
        <h2>Where can I get help?</h2>
        <p>Visit <Link href="/support">Mogging support</Link> for help with accounts, reports, billing, or privacy requests. You can also read our <Link href="/privacy">privacy policy</Link> and <Link href="/tos">terms of service</Link>.</p>
      </section>
    </GuidePage>
  )
}
