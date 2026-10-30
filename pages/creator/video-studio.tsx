import type { GetServerSideProps } from 'next'
import CreatorVideoStudio from '@/components/creator/creator-video-studio'
import { CreatorShell } from '@/components/creator/creator-shell'
import { getAuthSession } from '@/lib/auth/session'
import { requireVideoStudioAccess } from '@/lib/creator/studio-submission'

export default function VideoStudioPage() { return <CreatorShell><CreatorVideoStudio trackExports /></CreatorShell> }
export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const session = await getAuthSession(req, res)
  if (!session?.user?.id) return { redirect: { destination: '/creator', permanent: false } }
  try { await requireVideoStudioAccess(session.user.id) }
  catch (error) { if (error instanceof Error && 'status' in error && error.status === 403) return { notFound: true }; throw error }
  return { props: {} }
}
