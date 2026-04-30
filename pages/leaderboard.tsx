import { BarChart3 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export default function LeaderboardPage() {
  return (
    <section className="grid min-h-[calc(100vh-8rem)] content-center gap-4 py-10">
      <Badge variant="secondary" className="w-fit">
        Leaderboard
      </Badge>
      <div className="max-w-2xl">
        <BarChart3 className="mb-5 size-10 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Leaderboard shell
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Ratings, PSL, and user leaderboard views will be built here after we receive the UI designs.
        </p>
      </div>
    </section>
  )
}
