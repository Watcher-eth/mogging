import type { GetServerSideProps } from 'next'
import Link from 'next/link'
import { ArrowLeft, Share2 } from 'lucide-react'
import { getShareByToken } from '@/lib/sharing/service'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type SharePageProps = {
  share: Awaited<ReturnType<typeof getShareByToken>>
}

export default function SharePage({ share }: SharePageProps) {
  return (
    <section className="mx-auto grid max-w-5xl gap-5 py-4 sm:py-8">
      <Button asChild variant="ghost" className="w-fit">
        <Link href="/">
          <ArrowLeft className="size-4" aria-hidden="true" />
          New assessment
        </Link>
      </Button>

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <Badge variant="secondary">Shared report</Badge>
            <h1 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
              Facial Assessment
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
              {share.analysis.tierDescription || 'A private assessment result shared from Mogging.'}
            </p>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="PSL" value={share.analysis.pslScore} />
              <Metric label="Harmony" value={share.analysis.harmonyScore} />
              <Metric label="Dimorphism" value={share.analysis.dimorphismScore} />
              <Metric label="Angularity" value={share.analysis.angularityScore} />
            </div>

            <Button className="mt-8" onClick={() => navigator.share?.({ title: 'Facial Assessment', url: window.location.href })}>
              <Share2 className="size-4" aria-hidden="true" />
              Share
            </Button>
          </div>

          <div className="overflow-hidden rounded-md bg-muted">
            <img className="aspect-[4/5] h-full w-full object-cover" src={share.photo.imageUrl} alt="Shared assessment photo" />
          </div>
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="font-mono text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value?.toFixed(1) ?? '--'}</div>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps<SharePageProps> = async (context) => {
  const token = typeof context.params?.token === 'string' ? context.params.token : null
  if (!token) return { notFound: true }

  try {
    const share = await getShareByToken(token)
    return {
      props: {
        share: JSON.parse(JSON.stringify(share)),
      },
    }
  } catch {
    return { notFound: true }
  }
}
