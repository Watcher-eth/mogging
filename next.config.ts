import type { NextConfig } from 'next'

const immutableAssetPaths = [
  '/model.png',
  '/model2.png',
  '/model3.png',
  '/model4.png',
  '/model5.png',
  '/model6.png',
  '/model7.png',
  '/model8.png',
  '/model9.png',
  '/model10.png',
  '/model11.png',
  '/model12.png',
  '/model13.png',
  '/model14.png',
  '/Og1.png',
  '/Og2.png',
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/sounds/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      ...immutableAssetPaths.map((source) => ({
        source,
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      })),
    ]
  },
  images: {
    dangerouslyAllowSVG: true,
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-5d08741c541340c2b446a6609cd36e29.r2.dev',
      },
      {
        protocol: 'https',
        hostname: 'cdn-blog.prose.com',
      },
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
      },
      {
        protocol: 'https',
        hostname: 'cdn.simpleicons.org',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
}

export default nextConfig
