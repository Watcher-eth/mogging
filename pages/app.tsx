import type { GetServerSideProps } from 'next'
import { SeoHead } from '@/components/app/seo-head'
import { PhonePwaEntry } from '@/components/landing/phone-pwa-entry'
import { WebCheckout } from '@/components/landing/web-checkout'
import { usePhoneLayout } from '@/hooks/use-phone-layout'
import { isPhoneUserAgent } from '@/lib/analysis/phone-layout'

type Props = { phoneEntry: boolean }

export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) => ({
  props: { phoneEntry: isPhoneUserAgent(req.headers['user-agent'] ?? '', req.headers['sec-ch-ua-mobile']?.toString()) },
})

export default function AppFunnelPage({ phoneEntry }: Props) {
  if (usePhoneLayout(phoneEntry)) return <PhonePwaEntry />
  return <>
    <SeoHead title="Mogging | Web Analysis Plans" description="Compare Basic, Starter, and Pro. Start with your photos and unlock your full facial analysis on the web." path="/app" />
    <main data-desktop-entry=""><WebCheckout /></main>
  </>
}
