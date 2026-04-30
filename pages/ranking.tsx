import { Trophy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export default function RankingPage() {
  return (
    <section className="grid min-h-[calc(100vh-8rem)] content-center gap-4 py-10">
      <Badge variant="secondary" className="w-fit">
        Ranking
      </Badge>
      <div className="max-w-2xl">
        <Trophy className="mb-5 size-10 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Ranking flow shell
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Pairwise comparison UI will be built here once the design direction is locked.
        </p>
      </div>
    </section>
  )
}
