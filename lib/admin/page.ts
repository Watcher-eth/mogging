import { coursePageProps } from '@/lib/courses/pages'
import type { GetServerSideProps } from 'next'
import { getAuthSession } from '@/lib/auth/session'
import { isCreatorAdminEmail } from './creator-auth'

export const adminPageProps: GetServerSideProps = async ({ req, res }) => {
  res.setHeader('Cache-Control', 'private, no-store')
  const session = await getAuthSession(req, res)
  if (!session || !isCreatorAdminEmail(session.user?.email)) return { notFound: true }
  return { props: { session: { ...session, user: { ...session.user,
    name: session.user?.name ?? null, email: session.user?.email ?? null, image: session.user?.image ?? null,
  } } } }
}

export const adminCoursePageProps: GetServerSideProps = async context => {
  const course = await coursePageProps(context)
  if ('notFound' in course) return course
  return adminPageProps(context)
}
