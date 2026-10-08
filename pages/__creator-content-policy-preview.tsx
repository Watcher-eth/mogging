import { ContentRestrictions } from '@/components/creator/content-restrictions'
import { CREATOR_SUBMISSION_FORMATS } from '@/lib/creator/formats'

export default function ContentPolicyPreview() {
  return <main className="mx-auto max-w-3xl px-5 py-10"><p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Campaign brief · preview</p><h1 className="mb-6 mt-2 text-3xl font-semibold tracking-tight">Content rules</h1><ContentRestrictions rules={CREATOR_SUBMISSION_FORMATS[0].notAllowed} /></main>
}

export function getServerSideProps() {
  return process.env.NODE_ENV === 'production' ? { notFound: true } : { props: {} }
}
