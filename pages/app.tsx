import { SeoHead } from '@/components/app/seo-head'
import { WebCheckout } from '@/components/landing/web-checkout'

export default function AppFunnelPage() {
  return <>
    <SeoHead title="Mogging Pro | Secure Web Checkout" description="Choose a Mogging Pro plan and continue with secure checkout. Access your evaluations and Protocol in the iPhone app." path="/app" />
    <main><WebCheckout /></main>
  </>
}
