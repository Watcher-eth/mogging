import type { GetServerSideProps } from 'next'
import { CreatorWelcomeDialog, useCreatorWelcome } from '@/components/creator/creator-welcome'
import { CreatorEssentials } from '@/components/creator/creator-essentials'
import { Button } from '@/components/ui/button'

export const getServerSideProps: GetServerSideProps = async () => {
  if (process.env.NODE_ENV !== 'development') return { notFound: true }
  return { props: { userId: 'local-welcome-preview' } }
}

export default function WelcomePreview({ userId }: { userId: string }) {
  const welcome = useCreatorWelcome(userId)
  return <main className="creator-portal mx-auto max-w-5xl px-6 py-10">
    <p className="text-xs uppercase tracking-widest text-zinc-400">Creator Studio · Local preview</p>
    <h1 className="mb-3 mt-2 text-3xl font-semibold tracking-tight">Ready to create?</h1>
    <p className="mb-6 text-sm text-zinc-500">The first-visit intro opens automatically once. You can revisit it below.</p>
    <Button onClick={() => welcome.onOpenChange(true)} className="mb-8">Open creator quick guide</Button>
    <CreatorEssentials />
    <CreatorWelcomeDialog open={welcome.open} onOpenChange={welcome.onOpenChange} />
  </main>
}
