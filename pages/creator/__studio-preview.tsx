import Head from 'next/head'
import { useRouter } from 'next/router'
import { SessionContext } from 'next-auth/react'
import { SWRConfig, type Middleware, type Key, type BareFetcher, type SWRConfiguration } from 'swr'
import { SidebarProvider } from '@/components/ui/sidebar'
import { CreatorShell } from '@/components/creator/creator-shell'
import { CreatorStudioChooser } from '@/components/creator/creator-studio'

const previewData: Middleware = useSWRNext => <Data, Error>(key: Key, _fetcher: BareFetcher<Data> | null, config: SWRConfiguration<Data, Error>) => useSWRNext<Data, Error>(key, async () => ({
  profile: { paymentOption: 'paypal', paypalEmail: 'preview@example.com' },
  socialAccounts: [{}], submissions: [{}], payments: [], payoutRequests: [], updates: [], featureFlags: {}, communityMetrics: {},
}) as Data, { ...config, revalidateOnFocus: false, shouldRetryOnError: false })

export default function StudioPreview() {
  const { query } = useRouter()
  if (query.device === 'phone') return <main style={{padding:20,background:'#f5f6f8',minHeight:'100vh'}}><iframe title="Phone Studio preview" src="/creator/__studio-preview" style={{display:'block',width:390,height:844,border:'1px solid #e0e3e8',borderRadius:20,background:'white'}} /></main>
  return <SessionContext.Provider value={{data:{expires:'2099-01-01',user:{id:'',name:'Studio preview'}},status:'authenticated',update:async()=>null}}>
    <Head><title>Studio design preview</title><meta name="robots" content="noindex,nofollow" /></Head>
    <SWRConfig value={{provider:()=>new Map(),use:[previewData]}}><SidebarProvider className="min-h-0 flex-1 flex-col"><CreatorShell><CreatorStudioChooser postAccess={query.access === 'allowed' ? 'allowed' : 'locked'} /></CreatorShell></SidebarProvider></SWRConfig>
  </SessionContext.Provider>
}
export function getServerSideProps() { return process.env.NODE_ENV === 'development' ? {props:{}} : {notFound:true} }
