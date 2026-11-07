import type { GetServerSideProps } from 'next'
import { AppStoreHandoff } from '@/components/landing/app-store-handoff'
import type { LandingAssignment } from '@/lib/analytics/landing'

const assignment: LandingAssignment = { id: 'handoff-preview', arm: 'homepage_v3_b' }

export default function AppStoreHandoffPreview() {
  return <AppStoreHandoff assignment={assignment} autoRedirect={false} />
}

export const getServerSideProps: GetServerSideProps = async () =>
  process.env.NODE_ENV === 'development' ? { props: {} } : { notFound: true }
