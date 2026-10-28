import Link from 'next/link'
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import { analyticsPreviewPages } from '@/lib/admin/navigation'

const PreviewLinks = createContext(false)
export function AnalyticsPreviewLinks({children}:{children:ReactNode}) {
  return <PreviewLinks.Provider value>{children}</PreviewLinks.Provider>
}

export function analyticsPreviewHref(href:ComponentProps<typeof Link>['href']) {
  const path=typeof href==='string'?href:href.pathname
  const page=path?analyticsPreviewPages[path]:undefined
  if(!page)return href
  return {pathname:'/admin/__product-overview-preview',query:{...(typeof href==='object'&&typeof href.query==='object'?href.query:{}),page}}
}

// Only the local-only preview opts in. Authenticated analytics keeps its normal routes.
export function AnalyticsLink({href,...props}:ComponentProps<typeof Link>) {
  const preview=useContext(PreviewLinks)
  return <Link {...props} href={preview?analyticsPreviewHref(href):href}/>
}
