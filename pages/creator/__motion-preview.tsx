export { default } from '@/components/creator/creator-video-studio'

export function getServerSideProps({ query }: { query: Record<string, string | string[] | undefined> }) {
  return process.env.NODE_ENV === 'development' ? { props: { previewSubmission: query.submit === 'preview' } } : { notFound: true }
}
