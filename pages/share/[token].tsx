import type { GetServerSideProps } from 'next'

// Former public report links no longer expose reports or image previews.
export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader('Cache-Control', 'private, no-store')
  return { notFound: true }
}

export default function RemovedPublicReport() { return null }
