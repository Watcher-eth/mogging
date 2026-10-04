import type { GetServerSideProps } from 'next'
import { env } from '@/lib/env'

export type CoursePageProps = { allowSamples: boolean }

export function coursePagesEnabled(config: Pick<typeof env, 'COURSES_ENABLED' | 'COURSE_PUBLIC_LAUNCH_ENABLED' | 'NODE_ENV'>) {
  return config.COURSES_ENABLED && (config.NODE_ENV !== 'production' || config.COURSE_PUBLIC_LAUNCH_ENABLED)
}

export const coursePageProps: GetServerSideProps<CoursePageProps> = async () =>
  coursePagesEnabled(env)
    ? { props: { allowSamples: env.NODE_ENV === 'development' } }
    : { notFound: true }
