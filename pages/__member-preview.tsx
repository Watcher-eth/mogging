import type { GetServerSideProps } from 'next'
import Link from 'next/link'
import { DesktopMemberPreview } from '@/components/landing/desktop-member-preview'

export const getServerSideProps: GetServerSideProps = async ({ req, res, query }) => {
  if (process.env.NODE_ENV !== 'development' || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host ?? '')) return { notFound: true }
  res.setHeader('Cache-Control', 'private, no-store')
  return { props: { view: query.view === 'protocol' ? 'protocol' : 'progress', now: Date.now() } }
}

export default function MemberPreview({ view, now }: { view: string; now: number }) {
  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
      <span>Local preview · sample data</span>
      <Link className="underline underline-offset-4" href="/?landing_preview=homepage_b">See landing page</Link>
    </div>
    <DesktopMemberPreview view={view === 'protocol' ? 'protocol' : 'progress'} now={now} />
  </>
}
