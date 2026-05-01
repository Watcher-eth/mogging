import { useSession } from 'next-auth/react'
import { useMemo } from 'react'
import useSWR from 'swr'

type LeaderboardResponse = {
  items: LeaderboardEntry[]
  total: number
}

type CurrentUserRankResponse = {
  entry: LeaderboardEntry | null
}

type LeaderboardEntry = {
  id?: string
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

const leaderboardKey = '/api/leaderboard/photos?limit=24&sort=rating'
const podiumOrder = [1, 0, 2]

export default function LeaderboardPage() {
  const { status } = useSession()
  const { data: leaderboard } = useSWR<LeaderboardResponse>(leaderboardKey, {
    refreshInterval: 2_000,
    revalidateOnFocus: true,
  })
  const { data: currentUserRank } = useSWR<CurrentUserRankResponse>(
    status === 'authenticated' ? '/api/leaderboard/me' : null,
    {
      refreshInterval: 2_000,
      revalidateOnFocus: true,
      shouldRetryOnError: false,
    }
  )
  const entries = leaderboard?.items ?? []

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
                    key={entry.id || entry.photoId || entry.rank}
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
              <span className="text-right">PSL</span>
              <span className="text-right">Votes</span>
              <span className="hidden text-right sm:block">Social</span>
            </div>

            <div className="grid">
              {rankedEntries.length > 0 ? (
                rankedEntries.map((entry, index) => (
                  <RankRow key={entry.id || entry.photoId || entry.rank} entry={entry} index={index} />
                ))
              ) : (
                <div className="border-b border-zinc-200 py-10 text-sm text-zinc-500">
                  No ranked photos yet.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <CurrentUserRankBar entry={currentUserRank?.entry ?? null} />
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

function CurrentUserRankBar({ entry }: { entry: LeaderboardEntry | null }) {
  if (!entry) return null

  return (
    <div className="fixed inset-x-5 bottom-5 z-40 mx-auto max-w-3xl border border-black bg-white px-4 py-3 text-black shadow-[0_18px_50px_rgba(15,23,42,0.12)] sm:bottom-6">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
        <img
          alt=""
          className="size-12 rounded-full object-cover grayscale-[0.1]"
          src={entry.imageUrl || '/model.png'}
        />
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500">Your rank</p>
          <h2 className="mt-1 truncate text-lg font-semibold tracking-[-0.04em]">{entry.name || 'Your photo'}</h2>
        </div>
        <div className="text-right">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500">Rank</p>
          <p className="mt-1 text-2xl font-semibold tracking-[-0.06em]">#{entry.rank}</p>
        </div>
      </div>
    </div>
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
  return Math.max(0, Math.min(100, (score / 8) * 100))
}
