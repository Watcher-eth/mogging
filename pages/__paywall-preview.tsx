import { LockedReportPreview } from '@/components/payments/locked-report-preview'
import { useCallback } from 'react'
import { parseFaceLandmarksPayload } from '@/lib/analysis/landmarks'
import portrait from '@/components/landing/primer-portrait.json'
import Head from 'next/head'
import { useMemo, useState } from 'react'
import { SWRConfig } from 'swr'
import { toast } from 'sonner'
import { AnalysisUnlockDialog } from '@/components/payments/analysis-unlock-dialog'
import { webAnalysisPlans, webAnalysisProducts } from '@/lib/payments/web-analysis-plans'

const prices = { currency: 'usd', amounts: Object.fromEntries(webAnalysisProducts.map(product => [product, webAnalysisPlans[product].unitAmount])) }
export default function PaywallPreview() {
  const [open, setOpen] = useState(false)
  const unlock = useCallback(() => setOpen(true), [])
  const [count, setCount] = useState(1)
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState(false)
  const fallback = useMemo(() => ({ '/api/payments/subscription-prices?catalog=web-analysis': prices, '/api/payments/report-price?product=evaluation': { product: 'evaluation', currency: 'usd', amount: 499 }, '/api/payments/report-price?product=evaluation_pack_3': { product: 'evaluation_pack_3', currency: 'usd', amount: 999 } }), [])
  return <SWRConfig value={{ fallback, isPaused: () => true, revalidateOnMount: false, revalidateOnFocus: false }}><Head><title>Web membership · Design preview</title><meta name="robots" content="noindex,nofollow" /></Head><main className="[--report-preview-height:calc(100svh-170px)]"><div className="flex flex-wrap items-center gap-3 px-5 py-3 text-xs"><span className="mr-auto text-zinc-500">Design fixtures · no payments are created</span><button className="rounded-full border px-4 py-2" onClick={() => setOpen(true)}>Open paywall</button><button className="rounded-full border px-4 py-2" onClick={() => setLoading(v => !v)}>Toggle loading</button><button className="rounded-full border px-4 py-2" onClick={() => setFailure(v => !v)}>Toggle error</button><select aria-label="Photo count" value={count} onChange={e => setCount(Number(e.target.value))}>{[1,2,3].map(n => <option key={n} value={n}>{n} photo{n > 1 ? 's' : ''}</option>)}</select></div><LockedReportPreview imageSrc="/landing/report-city-portrait.webp" landmarks={parseFaceLandmarksPayload(portrait)} onUnlock={unlock} /><AnalysisUnlockDialog webCatalog desktopAnalysis open={open} onOpenChange={setOpen} imageCount={count} imageSrc="/landing/report-city-portrait.webp" landmarks={parseFaceLandmarksPayload(portrait)} loading={loading} error={failure ? 'Your connection was interrupted. No payment has been taken. Please try again.' : null} onCheckout={() => toast.info('Design preview — no checkout or payment is created.')} /></main></SWRConfig>
}
export function getServerSideProps() { return process.env.NODE_ENV === 'development' ? { props: {} } : { notFound: true } }
