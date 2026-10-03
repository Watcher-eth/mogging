import type { GetServerSideProps } from 'next'

// The unfinished course UI is a local development preview, never a public production route.
export const coursePreviewProps: GetServerSideProps = async () =>
  process.env.NODE_ENV === 'production' || process.env.COURSES_ENABLED !== 'true' ? { notFound: true } : { props: {} }
