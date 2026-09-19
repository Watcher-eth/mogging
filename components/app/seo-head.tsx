import Head from 'next/head'
import { useRouter } from 'next/router'
import { canonicalUrl as getCanonicalUrl, robotsForPath, serializeJsonLd, siteUrl } from '@/lib/seo'

type SeoHeadProps = {
  title?: string
  description?: string
  imagePath?: string
  path?: string
  structuredData?: Record<string, unknown>
}

const defaultTitle = 'Mogging'
const defaultDescription = 'Battle faces, get a PSL analysis, and climb the global mogging leaderboard.'
const defaultImagePath = '/moggingOG2.png'
const iosAppStoreId = '6771414050'

export function SeoHead({
  title = defaultTitle,
  description = defaultDescription,
  imagePath = defaultImagePath,
  path,
  structuredData,
}: SeoHeadProps) {
  const router = useRouter()
  const currentPath = path ?? router.asPath ?? '/'
  const canonicalUrl = getCanonicalUrl(currentPath)
  const imageUrl = new URL(imagePath, siteUrl).href


  return (
    <Head>
      <meta key="robots" name="robots" content={robotsForPath(router.pathname)} />
      {structuredData ? (
        <script key="structured-data" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      ) : null}
      <title key="title">{title}</title>
      <meta key="description" name="description" content={description} />
      <meta key="apple-itunes-app" name="apple-itunes-app" content={`app-id=${iosAppStoreId}, app-argument=${canonicalUrl}`} />
      <link key="canonical" rel="canonical" href={canonicalUrl} />
      <link key="favicon" rel="icon" type="image/png" href="/favicon.png" />
      <link key="apple-touch-icon" rel="apple-touch-icon" href="/favicon.png" />

      <meta key="og:type" property="og:type" content="website" />
      <meta key="og:site_name" property="og:site_name" content="Mogging" />
      <meta key="og:title" property="og:title" content={title} />
      <meta key="og:description" property="og:description" content={description} />
      <meta key="og:url" property="og:url" content={canonicalUrl} />
      <meta key="og:image" property="og:image" content={imageUrl} />
      <meta key="og:image:width" property="og:image:width" content="1200" />
      <meta key="og:image:height" property="og:image:height" content="630" />
      <meta key="og:image:alt" property="og:image:alt" content={title} />

      <meta key="twitter:card" name="twitter:card" content="summary_large_image" />
      <meta key="twitter:title" name="twitter:title" content={title} />
      <meta key="twitter:description" name="twitter:description" content={description} />
      <meta key="twitter:image" name="twitter:image" content={imageUrl} />
    </Head>
  )
}
