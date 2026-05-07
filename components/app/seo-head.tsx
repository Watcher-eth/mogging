import Head from 'next/head'
import { useRouter } from 'next/router'

type SeoHeadProps = {
  title?: string
  description?: string
  imagePath?: string
  path?: string
}

const defaultTitle = 'Mogging'
const defaultDescription = 'Battle faces, get a PSL analysis, and climb the global mogging leaderboard.'
const defaultImagePath = '/moggingOG2.png'

export function SeoHead({
  title = defaultTitle,
  description = defaultDescription,
  imagePath = defaultImagePath,
  path,
}: SeoHeadProps) {
  const router = useRouter()
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  const currentPath = path ?? router.asPath?.split('?')[0] ?? '/'
  const canonicalUrl = siteUrl ? `${siteUrl}${currentPath === '/' ? '' : currentPath}` : currentPath
  const imageUrl = siteUrl ? `${siteUrl}${imagePath}` : imagePath

  return (
    <Head>
      <title key="title">{title}</title>
      <meta key="description" name="description" content={description} />
      <link key="canonical" rel="canonical" href={canonicalUrl} />

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
