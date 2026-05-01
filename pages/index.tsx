import { Loader2, RefreshCw, X } from 'lucide-react'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { toast } from 'sonner'
import { apiPost, ApiClientError } from '@/lib/api/client'

type ComparisonPhoto = {
  id: string
  imageUrl: string
  name: string | null
  gender: 'male' | 'female' | 'other'
  photoType: 'face' | 'body' | 'outfit'
  userId: string | null
  displayRating: number
  conservativeScore: number
  winCount: number
  lossCount: number
  pslScore: number | null
}

type ComparisonPair = {
  left: ComparisonPhoto
  right: ComparisonPhoto
}

type VoteResponse = {
  comparisonId: string
  winnerDisplayRating: number
  loserDisplayRating: number
  totalComparisons: number
}

type PendingVote = {
  id: string
  loserSide: 'left' | 'right'
  winner: ComparisonPhoto
  loser: ComparisonPhoto
}

const photoLeaderboardKey = '/api/leaderboard/photos?limit=24&sort=rating'

export default function VotingPage() {
  const { mutate: mutateGlobal } = useSWRConfig()
  const [pairKey] = useState(() => `/api/compare?photoType=face&gender=all&request=${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const { data: pair, error, isLoading, mutate } = useSWR<ComparisonPair>(pairKey, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
  })
  const visiblePair = pair ?? null
  const [pendingVote, setPendingVote] = useState<PendingVote | null>(null)
  const [transitionLoser, setTransitionLoser] = useState<{ id: string; side: 'left' | 'right' } | null>(null)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const submitVote = useCallback(async (winner: ComparisonPhoto, loser: ComparisonPhoto) => {
    const previousPair = pair

    try {
      await apiPost<VoteResponse>('/api/compare', {
        winnerPhotoId: winner.id,
        loserPhotoId: loser.id,
      })
      toast.success(`Registered your vote for ${winner.name || `${winner.gender} face`}`)
      void mutateGlobal(photoLeaderboardKey)
      void mutateGlobal('/api/leaderboard/me')
      await mutate()
    } catch (voteError) {
      await mutate(previousPair, { revalidate: false })
      toast.error(voteError instanceof ApiClientError ? voteError.message : 'Unable to submit vote')
    }
  }, [mutate, mutateGlobal, pair])

  useEffect(() => {
    if (!pendingVote) return

    pendingTimerRef.current = setTimeout(() => {
      setTransitionLoser({ id: pendingVote.loser.id, side: pendingVote.loserSide })
      setPendingVote(null)
      const committedVote = pendingVote

      setTimeout(() => {
        void (async () => {
          await submitVote(committedVote.winner, committedVote.loser)
          setTransitionLoser(null)
        })()
      }, 560)
    }, 4_000)

    return () => {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current)
        pendingTimerRef.current = null
      }
    }
  }, [pendingVote, submitVote])

  const queueVote = useCallback((winner: ComparisonPhoto, loser: ComparisonPhoto, loserSide: 'left' | 'right') => {
    setPendingVote({
      id: `${winner.id}-${Date.now()}`,
      loserSide,
      winner,
      loser,
    })
  }, [])

  useEffect(() => {
    if (!visiblePair || pendingVote) return
    const activePair = visiblePair

    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'a') queueVote(activePair.left, activePair.right, 'right')
      if (event.key.toLowerCase() === 'b') queueVote(activePair.right, activePair.left, 'left')
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingVote, queueVote, visiblePair])

  function cancelPendingVote() {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current)
      pendingTimerRef.current = null
    }
    setPendingVote(null)
  }

  return (
    <section className="min-h-[calc(100vh-5rem)] bg-white px-5 py-7 text-black sm:px-10 sm:py-14">
      <style jsx global>{`
        @keyframes battle-enter {
          from {
            opacity: 0;
            transform: translateY(18px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes battle-progress {
          from {
            transform: scaleX(0);
          }

          to {
            transform: scaleX(1);
          }
        }

        @keyframes battle-toast-enter {
          from {
            opacity: 0;
            transform: translateY(120%) scaleY(0.86);
          }

          to {
            opacity: 1;
            transform: translateY(0) scaleY(1);
          }
        }

        @keyframes battle-toast-exit {
          from {
            opacity: 1;
            transform: translateY(0) scaleY(1);
          }

          to {
            opacity: 0;
            transform: translateY(120%) scaleY(0.82);
          }
        }

        @keyframes battle-candidate-enter-left {
          from {
            filter: blur(4px);
            opacity: 0;
            transform: translateX(-8%) translateY(14px) scale(0.985);
          }

          to {
            filter: blur(0);
            opacity: 1;
            transform: translateX(0) translateY(0) scale(1);
          }
        }

        @keyframes battle-candidate-enter-right {
          from {
            filter: blur(4px);
            opacity: 0;
            transform: translateX(8%) translateY(14px) scale(0.985);
          }

          to {
            filter: blur(0);
            opacity: 1;
            transform: translateX(0) translateY(0) scale(1);
          }
        }

        @keyframes battle-candidate-exit-left {
          from {
            filter: blur(0);
            opacity: 1;
            transform: translateX(0) scale(1);
          }

          to {
            filter: blur(5px);
            opacity: 0;
            transform: translateX(-22%) scale(0.965);
          }
        }

        @keyframes battle-candidate-exit-right {
          from {
            filter: blur(0);
            opacity: 1;
            transform: translateX(0) scale(1);
          }

          to {
            filter: blur(5px);
            opacity: 0;
            transform: translateX(22%) scale(0.965);
          }
        }
      `}</style>

      {isLoading ? (
        <BattleState icon={<Loader2 className="size-5 animate-spin" aria-hidden="true" />} title="Loading matchup" />
      ) : visiblePair ? (
        <main className="grid gap-7 sm:gap-12">
          <header
            className="border-b border-zinc-200 pb-5 sm:pb-10"
            style={{ animation: 'battle-enter 560ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
          >
            <div className="grid gap-3 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <h1 className="max-w-4xl text-4xl font-semibold leading-[0.94] tracking-[-0.07em] sm:text-6xl lg:text-7xl">
                Who mogs harder?
              </h1>
              <div className="font-mono text-xs uppercase tracking-[0.12em] text-zinc-500 lg:text-right">
                Press A or B
              </div>
            </div>
          </header>

          <div
            className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_112px_minmax(0,1fr)] lg:items-stretch"
            style={{ animation: 'battle-enter 620ms cubic-bezier(0.22, 1, 0.36, 1) 80ms both' }}
          >
            <BattleCandidate
              key={visiblePair.left.id}
              enterFrom="left"
              photo={visiblePair.left}
              pendingVote={pendingVote}
              transitionLoser={transitionLoser}
              side="left"
              shortcut="A"
              onVote={() => queueVote(visiblePair.left, visiblePair.right, 'right')}
            />
            <BattleDivider />
            <BattleCandidate
              key={visiblePair.right.id}
              enterFrom="right"
              photo={visiblePair.right}
              pendingVote={pendingVote}
              transitionLoser={transitionLoser}
              side="right"
              shortcut="B"
              onVote={() => queueVote(visiblePair.right, visiblePair.left, 'left')}
            />
          </div>
        </main>
      ) : (
        <BattleState
          icon={<RefreshCw className="size-5" aria-hidden="true" />}
          title="No matchup ready"
          description={error instanceof ApiClientError ? error.message : 'Add at least two public photos to begin voting.'}
        />
      )}

      <PendingVoteBar pendingVote={pendingVote} onCancel={cancelPendingVote} />
    </section>
  )
}

function BattleCandidate({
  enterFrom,
  onVote,
  pendingVote,
  photo,
  shortcut,
  side,
  transitionLoser,
}: {
  enterFrom: 'left' | 'right'
  onVote: () => void
  pendingVote: PendingVote | null
  photo: ComparisonPhoto
  shortcut: 'A' | 'B'
  side: 'left' | 'right'
  transitionLoser: { id: string; side: 'left' | 'right' } | null
}) {
  const totalVotes = photo.winCount + photo.lossCount
  const winRate = totalVotes > 0 ? Math.round((photo.winCount / totalVotes) * 100) : 0
  const displayName = photo.name || `${photo.gender} face`
  const isSelected = pendingVote?.winner.id === photo.id
  const isPendingLoser = pendingVote?.loser.id === photo.id
  const isRejected = transitionLoser?.id === photo.id
  const exitTo = transitionLoser?.side === 'right' ? 'left' : 'right'

  return (
    <article
      className={[
        'group grid gap-4 will-change-transform transition-opacity duration-500 ease-out',
        isSelected ? 'opacity-100' : '',
        isPendingLoser ? 'opacity-45' : '',
      ].join(' ')}
      style={{
        animation: isRejected
          ? `battle-candidate-exit-${exitTo} 560ms cubic-bezier(0.55, 0.06, 0.68, 0.19) both`
          : `battle-candidate-enter-${enterFrom} 720ms cubic-bezier(0.22, 1, 0.36, 1) both`,
        pointerEvents: isRejected ? 'none' : 'auto',
      }}
    >
      <div className={`flex items-end justify-between gap-5 ${side === 'right' ? 'sm:flex-row-reverse sm:text-right' : ''}`}>
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-500">Rank / pending</p>
          <h2 className="mt-2 truncate text-5xl font-semibold leading-none tracking-[-0.065em]">{displayName}</h2>
        </div>
        <div className="shrink-0 bg-white px-2 py-1 font-mono text-xs font-semibold">
          [{shortcut}]
        </div>
      </div>

      <button
        aria-label={`Vote for ${displayName}`}
        className={[
          'relative aspect-[2.5/3] w-full max-w-[560px] overflow-hidden border bg-white text-left outline-none transition-[border-color,transform] duration-300 ease-out hover:-translate-y-1 active:translate-y-0',
          side === 'right' ? 'lg:ml-auto' : 'lg:mr-auto',
          isSelected ? 'border-black' : 'border-zinc-200',
        ].join(' ')}
        onClick={onVote}
        type="button"
      >
        <Image
          alt={displayName}
          className="object-cover grayscale-[0.08] transition duration-700 ease-out group-hover:scale-[1.025]"
          src={photo.imageUrl}
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0)_34%,rgba(255,255,255,0.22)_58%,rgba(255,255,255,0.96)_100%)]" />
        {isPendingLoser ? (
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0.52)_48%,rgba(255,255,255,0.98)_100%)]" />
        ) : null}
        {isSelected ? (
          <div className="absolute right-5 top-5 bg-black px-3 py-1.5 font-mono text-xs uppercase tracking-[0.12em] text-white">
            Selected
          </div>
        ) : null}
      </button>

      <div className={`grid grid-cols-3 border-y border-zinc-300 py-3 ${side === 'right' ? 'sm:text-right' : ''}`}>
        <Metric label="Score" value={formatVotingScore(photo.displayRating)} />
        <Metric label="PSL" value={formatPsl(photo.pslScore)} />
        <Metric label="Win" value={`${winRate}%`} />
      </div>
    </article>
  )
}

function BattleDivider() {
  return (
    <div className="grid place-items-center border-y border-zinc-200 py-3 lg:border-x lg:border-y-0 lg:py-0">
      <div className="grid justify-items-center gap-2 lg:gap-4">
        <div className="h-5 w-px bg-zinc-200 lg:h-16" />
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 lg:text-xs lg:tracking-[0.16em]">VS</div>
        <div className="h-5 w-px bg-zinc-200 lg:h-16" />
      </div>
    </div>
  )
}

function PendingVoteBar({
  onCancel,
  pendingVote,
}: {
  onCancel: () => void
  pendingVote: PendingVote | null
}) {
  const [renderedVote, setRenderedVote] = useState<PendingVote | null>(pendingVote)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    if (pendingVote) {
      setRenderedVote(pendingVote)
      setIsClosing(false)
      return
    }

    if (!renderedVote) return

    setIsClosing(true)
    const exitTimer = setTimeout(() => {
      setRenderedVote(null)
      setIsClosing(false)
    }, 280)

    return () => clearTimeout(exitTimer)
  }, [pendingVote, renderedVote])

  if (!renderedVote) return null

  return (
    <div
      className="fixed inset-x-5 bottom-8 z-50 mx-auto grid max-w-[460px] origin-bottom gap-3"
      style={{
        animation: isClosing
          ? 'battle-toast-exit 280ms cubic-bezier(0.55, 0.06, 0.68, 0.19) both'
          : 'battle-toast-enter 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
        pointerEvents: isClosing ? 'none' : 'auto',
      }}
    >
      <div className="flex items-center justify-between border border-zinc-200 bg-white px-4 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
        <div>
          <p className="text-lg font-semibold tracking-[-0.04em]">{renderedVote.winner.name || 'Selected face'}</p>
        </div>
        <button
          aria-label="Cancel vote"
          className="grid size-9 place-items-center rounded-full text-zinc-500 transition-colors duration-200 hover:bg-zinc-100 hover:text-black"
          onClick={onCancel}
          type="button"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="h-1 bg-zinc-200">
        {!isClosing ? (
          <div
            key={renderedVote.id}
            className="h-full origin-left bg-black"
            style={{ animation: 'battle-progress 4s linear both' }}
          />
        ) : null}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-[-0.04em]">{value}</p>
    </div>
  )
}

function BattleState({
  description,
  icon,
  title,
}: {
  description?: string
  icon: ReactNode
  title: string
}) {
  return (
    <div className="grid min-h-[calc(100vh-13rem)] place-items-center text-center">
      <div>
        <div className="mx-auto grid size-12 place-items-center text-black/50">{icon}</div>
        <h1 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">{title}</h1>
        {description ? <p className="mt-2 max-w-sm text-sm leading-6 text-black/52">{description}</p> : null}
      </div>
    </div>
  )
}

function formatPsl(score?: number | null) {
  if (typeof score !== 'number') return '--'
  return score.toFixed(1)
}

function formatVotingScore(score: number) {
  return Math.round(score).toLocaleString()
}
