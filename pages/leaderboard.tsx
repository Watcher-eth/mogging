import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '@/lib/api/client'

type LeaderboardResponse = {
  items: LeaderboardEntry[]
  total: number
}

type LeaderboardEntry = {
  rank: number
  photoId?: string
  imageUrl?: string | null
  name?: string | null
  gender?: string | null
  displayRating?: number | null
  winCount?: number | null
  lossCount?: number | null
  comparisonCount?: number | null
  pslScore?: number | null
  harmonyScore?: number | null
  dimorphismScore?: number | null
  angularityScore?: number | null
  percentile?: number | null
  tier?: string | null
  social?: string | null
}

const fallbackEntries: LeaderboardEntry[] = [
  { rank: 1, name: 'Vanta', imageUrl: '/model6.png', displayRating: 9.4, winCount: 982, comparisonCount: 1240, pslScore: 9.4, harmonyScore: 94, dimorphismScore: 91, angularityScore: 88, social: '@vanta' },
  { rank: 2, name: 'Astra', imageUrl: '/model8.png', displayRating: 9.1, winCount: 871, comparisonCount: 1104, pslScore: 9.1, harmonyScore: 91, dimorphismScore: 87, angularityScore: 86, social: '@astra' },
  { rank: 3, name: 'Rook', imageUrl: '/model4.png', displayRating: 8.9, winCount: 846, comparisonCount: 1068, pslScore: 8.9, harmonyScore: 89, dimorphismScore: 86, angularityScore: 90, social: '@rook' },
  { rank: 4, name: 'Nero', imageUrl: '/model.png', displayRating: 8.6, winCount: 724, comparisonCount: 940, pslScore: 8.6, harmonyScore: 87, dimorphismScore: 84, angularityScore: 85 },
  { rank: 5, name: 'Vale', imageUrl: '/model10.png', displayRating: 8.4, winCount: 690, comparisonCount: 902, pslScore: 8.4, harmonyScore: 85, dimorphismScore: 82, angularityScore: 83, social: '@vale' },
  { rank: 6, name: 'Sol', imageUrl: '/model12.png', displayRating: 8.2, winCount: 642, comparisonCount: 866, pslScore: 8.2, harmonyScore: 83, dimorphismScore: 81, angularityScore: 82 },
  { rank: 7, name: 'Kairo', imageUrl: '/model2.png', displayRating: 8.0, winCount: 598, comparisonCount: 840, pslScore: 8.0, harmonyScore: 81, dimorphismScore: 79, angularityScore: 80, social: '@kairo' },
  { rank: 8, name: 'Mika', imageUrl: '/model14.png', displayRating: 7.8, winCount: 550, comparisonCount: 801, pslScore: 7.8, harmonyScore: 79, dimorphismScore: 78, angularityScore: 77 },
]

const podiumOrder = [1, 0, 2]

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>(fallbackEntries)

  useEffect(() => {
    let cancelled = false

    apiGet<LeaderboardResponse>('/api/leaderboard/photos?limit=24&sort=rating')
      .then((leaderboard) => {
        if (cancelled || leaderboard.items.length === 0) return
        setEntries(leaderboard.items)
      })
      .catch(() => {
        if (!cancelled) {
          setEntries(fallbackEntries)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const topThree = useMemo(() => entries.slice(0, 3), [entries])
  const rankedEntries = useMemo(() => entries.slice(3), [entries])

  return (
    <section className="min-h-[calc(100vh-5rem)] bg-white px-5 py-14 text-black sm:px-10">
      <style jsx global>{`
        @keyframes leaderboard-enter {
          from {
            opacity: 0;
            transform: translateY(18px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes leaderboard-line {
          from {
            transform: scaleX(0);
          }

          to {
            transform: scaleX(1);
          }
        }
      `}</style>
      <div className="grid w-full gap-14">
        <header
          className="border-b border-zinc-200 pb-10"
          style={{ animation: 'leaderboard-enter 560ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
        >
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-500">Leaderboard //</p>
          <h1 className="mt-6 max-w-4xl text-6xl font-semibold leading-[0.94] tracking-[-0.07em] sm:text-7xl lg:text-8xl">
            Global mogging ranks
          </h1>
        </header>

        <div className="grid gap-16">
          <section aria-label="Podium leaderboard entries" className="grid gap-6">
            <div className="grid min-h-[430px] grid-cols-1 items-end gap-6 sm:grid-cols-3">
              {podiumOrder.map((entryIndex) => {
                const entry = topThree[entryIndex]
                if (!entry) return null

                return (
                  <TopEntry
                    key={entry.photoId || entry.rank}
                    entry={entry}
                    elevated={entry.rank === 1}
                    index={entryIndex}
                  />
                )
              })}
            </div>
          </section>

          <section aria-label="Full leaderboard" className="grid gap-4">
            <div className="grid grid-cols-[56px_minmax(0,1fr)_80px_92px] gap-4 border-b border-zinc-200 pb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500 sm:grid-cols-[64px_minmax(0,1fr)_96px_96px_120px]">
              <span>Rank</span>
              <span>Profile</span>
              <span className="text-right">Score</span>
              <span className="text-right">Votes</span>
              <span className="hidden text-right sm:block">Social</span>
            </div>

            <div className="grid">
              {rankedEntries.map((entry, index) => (
                <RankRow key={entry.photoId || entry.rank} entry={entry} index={index} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  )
}

function TopEntry({ elevated, entry, index }: { elevated?: boolean; entry: LeaderboardEntry; index: number }) {
  return (
    <article
      className={`group grid gap-4 ${elevated ? 'pb-10' : 'pb-0'}`}
      style={{
        animation: `leaderboard-enter 620ms cubic-bezier(0.22, 1, 0.36, 1) ${80 + index * 80}ms both`,
      }}
    >
      <div className="relative mx-auto w-full max-w-[230px] overflow-hidden border border-zinc-200 bg-white">
        <div className={elevated ? 'aspect-[3/4]' : 'aspect-[3/3.65]'}>
          <img
            alt=""
            className="h-full w-full object-cover grayscale-[0.1] transition duration-500 ease-out group-hover:scale-[1.035]"
            src={entry.imageUrl || '/model.png'}
          />
        </div>
        <div className="absolute left-3 top-3 bg-white px-2 py-1 font-mono text-xs font-semibold">
          [{String(entry.rank).padStart(3, '0')}]
        </div>
      </div>

      <div className="grid gap-3 border-t border-zinc-200 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-xl font-semibold tracking-[-0.05em]">{entry.name || 'Anonymous'}</h3>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-zinc-500">
              {entry.tier || 'Ranked'} / {entry.gender || 'global'}
            </p>
          </div>
          <div className="text-right text-3xl font-semibold tracking-[-0.06em]">
            {formatScore(displayScore(entry))}
          </div>
        </div>
        <div className="h-1 bg-zinc-100">
          <div
            className="h-full origin-left bg-black"
            style={{
              animation: `leaderboard-line 780ms cubic-bezier(0.22, 1, 0.36, 1) ${260 + index * 60}ms both`,
              width: `${scorePercent(displayScore(entry))}%`,
            }}
          />
        </div>
      </div>
    </article>
  )
}

function RankRow({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  return (
    <article
      className="group grid grid-cols-[56px_minmax(0,1fr)_80px_92px] items-center gap-4 border-b border-zinc-200 py-4 transition-colors duration-200 hover:bg-zinc-50 sm:grid-cols-[64px_minmax(0,1fr)_96px_96px_120px]"
      style={{
        animation: `leaderboard-enter 480ms cubic-bezier(0.22, 1, 0.36, 1) ${180 + index * 35}ms both`,
      }}
    >
      <span className="font-mono text-sm text-zinc-500">{String(entry.rank).padStart(2, '0')}</span>
      <div className="flex min-w-0 items-center gap-4">
        <img
          alt=""
          className="size-12 shrink-0 rounded-full object-cover grayscale-[0.1] transition-transform duration-300 ease-out group-hover:scale-105"
          src={entry.imageUrl || '/model.png'}
        />
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-[-0.04em]">{entry.name || 'Anonymous'}</h3>
          <p className="mt-1 truncate font-mono text-xs uppercase tracking-[0.1em] text-zinc-500">
            H {formatSmallMetric(entry.harmonyScore)} / D {formatSmallMetric(entry.dimorphismScore)} / A {formatSmallMetric(entry.angularityScore)}
          </p>
        </div>
      </div>
      <span className="text-right text-xl font-semibold tracking-[-0.05em]">{formatScore(displayScore(entry))}</span>
      <span className="text-right font-mono text-xs text-zinc-500">{formatVotes(entry)}</span>
      <span className="hidden truncate text-right text-sm text-zinc-500 sm:block">{entry.social || '-'}</span>
    </article>
  )
}

function formatScore(score?: number | null) {
  if (typeof score !== 'number') return '-'
  return score.toFixed(1)
}

function formatSmallMetric(score?: number | null) {
  if (typeof score !== 'number') return '--'
  return String(Math.round(score))
}

function formatVotes(entry: LeaderboardEntry) {
  const votes = entry.comparisonCount ?? entry.winCount
  if (typeof votes !== 'number') return '-'
  return votes.toLocaleString()
}

function displayScore(entry: LeaderboardEntry) {
  return entry.pslScore ?? entry.displayRating
}

function scorePercent(score?: number | null) {
  if (typeof score !== 'number') return 0
  return Math.max(0, Math.min(100, (score / 10) * 100))
}
