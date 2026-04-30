import { AnimatePresence, motion } from 'motion/react'
import { Crown, Loader2, RefreshCw, Star, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { apiPost, ApiClientError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

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
  winner: ComparisonPhoto
  loser: ComparisonPhoto
}

const pairKey = '/api/compare?photoType=face&gender=all'
const previewPhotoUrl = 'https://ia8cttci1ljr2atc.public.blob.vercel-storage.com/photos/cmmi2sj8s0009278h705nfdpc.jpeg'
const previewPair: ComparisonPair = {
  left: {
    id: 'preview-left',
    imageUrl: previewPhotoUrl,
    name: 'Lucas Crespo',
    gender: 'other',
    photoType: 'face',
    userId: null,
    displayRating: 1184,
    conservativeScore: 18.4,
    winCount: 42,
    lossCount: 18,
  },
  right: {
    id: 'preview-right',
    imageUrl: previewPhotoUrl,
    name: 'The Explorer',
    gender: 'other',
    photoType: 'face',
    userId: null,
    displayRating: 1217,
    conservativeScore: 19.1,
    winCount: 51,
    lossCount: 21,
  },
}

export default function VotingPage() {
  const { data: pair, error, isLoading, mutate } = useSWR<ComparisonPair>(pairKey)
  const visiblePair = pair ?? (!isLoading ? previewPair : null)
  const [pendingVote, setPendingVote] = useState<PendingVote | null>(null)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const submitVote = useCallback(async (winner: ComparisonPhoto, loser: ComparisonPhoto) => {
    if (winner.id.startsWith('preview-') || loser.id.startsWith('preview-')) {
      toast.info('Preview vote only. Real voting starts once DB photos are seeded.')
      return
    }

    const previousPair = pair

    try {
      await mutate(undefined, { revalidate: false })
      const result = await apiPost<VoteResponse>('/api/compare', {
        winnerPhotoId: winner.id,
        loserPhotoId: loser.id,
      })
      toast.success(`Vote counted. ${result.totalComparisons.toLocaleString()} total votes.`)
      await mutate()
    } catch (voteError) {
      await mutate(previousPair, { revalidate: false })
      toast.error(voteError instanceof ApiClientError ? voteError.message : 'Unable to submit vote')
    }
  }, [mutate, pair])

  useEffect(() => {
    if (!pendingVote) return

    pendingTimerRef.current = setTimeout(() => {
      setPendingVote(null)
      void submitVote(pendingVote.winner, pendingVote.loser)
    }, 4_000)

    return () => {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current)
        pendingTimerRef.current = null
      }
    }
  }, [pendingVote, submitVote])

  function queueVote(winner: ComparisonPhoto, loser: ComparisonPhoto) {
    setPendingVote({
      id: `${winner.id}-${Date.now()}`,
      winner,
      loser,
    })
  }

  function cancelPendingVote() {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current)
      pendingTimerRef.current = null
    }
    setPendingVote(null)
  }

  return (
    <div className="min-h-[100svh] bg-white text-black">
      <main className="min-h-[calc(100svh-5rem)] px-5 pb-5 pt-8 sm:px-10 sm:pb-8 sm:pt-10">
        {isLoading ? (
          <VotingState icon={<Loader2 className="size-5 animate-spin" aria-hidden="true" />} title="Loading matchup" />
        ) : visiblePair ? (
          <AnimatePresence mode="wait">
            <motion.section
              key={`${visiblePair.left.id}-${visiblePair.right.id}`}
              className="grid min-h-[calc(100svh-7rem)] w-full content-start gap-10 md:grid-cols-[minmax(0,1fr)_360px_minmax(0,1fr)] md:gap-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            >
              <VoteCandidate
                photo={visiblePair.left}
                pendingVote={pendingVote}
                side="left"
                onVote={() => queueVote(visiblePair.left, visiblePair.right)}
              />
              <VotePrompt />
              <VoteCandidate
                photo={visiblePair.right}
                pendingVote={pendingVote}
                side="right"
                onVote={() => queueVote(visiblePair.right, visiblePair.left)}
              />
            </motion.section>
          </AnimatePresence>
        ) : (
          <VotingState
            icon={<RefreshCw className="size-5" aria-hidden="true" />}
            title="No matchup ready"
            description={error instanceof ApiClientError ? error.message : 'Add at least two public photos to begin voting.'}
          />
        )}
      </main>
      <PendingVoteBar pendingVote={pendingVote} onCancel={cancelPendingVote} />
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
  return (
    <AnimatePresence>
      {pendingVote ? (
        <motion.div
          className="fixed inset-x-5 bottom-10 z-50 mx-auto max-w-[420px]"
          initial={{ filter: 'blur(8px)', opacity: 0, scale: 0.98, y: 30 }}
          animate={{ filter: 'blur(0px)', opacity: 1, scale: 1, y: 0 }}
          exit={{ filter: 'blur(6px)', opacity: 0, scale: 0.98, y: 18 }}
          transition={{ type: 'spring', duration: 0.48, bounce: 0.08 }}
        >
          <div className="mb-3 flex justify-center">
            <button
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-black shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition-transform duration-150 ease-out hover:bg-zinc-50 active:scale-[0.97]"
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full border border-zinc-200 bg-white p-[2px] shadow-[0_14px_36px_rgba(15,23,42,0.1)]">
            <motion.div
              key={pendingVote.id}
              className="h-full origin-center rounded-full bg-zinc-400"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 4, ease: 'linear' }}
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function VotePrompt() {
  return (
    <div className="grid content-center justify-items-center py-2 text-center md:min-h-[58svh] md:pt-28">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/35">Vote</div>
        <h2 className="mt-2 max-w-[360px] text-5xl font-semibold leading-[0.9] tracking-[-0.065em] md:text-6xl">
          Which one looks better?
        </h2>
      </div>
    </div>
  )
}

function VoteCandidate({
  onVote,
  pendingVote,
  photo,
  side,
}: {
  onVote: () => void
  pendingVote: PendingVote | null
  photo: ComparisonPhoto
  side: 'left' | 'right'
}) {
  const totalVotes = photo.winCount + photo.lossCount
  const winRate = totalVotes > 0 ? Math.round((photo.winCount / totalVotes) * 100) : 0
  const displayName = photo.name || `${photo.gender} face`
  const voteState = !pendingVote ? 'idle' : pendingVote.winner.id === photo.id ? 'selected' : 'rejected'

  return (
    <div className="group relative grid content-start text-left">
      <div className={`mb-4 ${side === 'right' ? 'md:text-right' : ''}`}>
        <PersonMeta displayName={displayName} rating={photo.displayRating} totalVotes={totalVotes} winRate={winRate} side={side} />
      </div>

      <div className={`grid min-h-0 place-items-center ${side === 'left' ? 'md:place-items-start' : 'md:place-items-end'}`}>
        <div className={`relative flex h-[42svh] max-h-[460px] min-h-[260px] w-full items-center gap-4 md:h-[58svh] md:max-h-[660px] ${side === 'left' ? 'justify-start' : 'justify-end'}`}>
          {side === 'right' ? (
            <LikeButton
              onVote={onVote}
              label={`Vote for ${displayName}`}
              pendingId={pendingVote?.id}
              shortcut="B"
              state={voteState}
            />
          ) : null}
          <button className="relative h-full outline-none transition-transform duration-200 ease-out active:scale-[0.99]" onClick={onVote} type="button" aria-label={`Vote for ${displayName}`}>
            <div className="relative aspect-[2/3] h-full max-h-full overflow-hidden rounded-2xl border-[6px] border-white bg-white shadow-[0_22px_70px_rgba(15,23,42,0.13)] transition-transform duration-200 ease-out group-hover:scale-[1.01]">
              <img className="h-full w-full object-cover" src={photo.imageUrl} alt={displayName} />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/5 bg-gradient-to-t from-white/75 via-white/30 to-transparent" />
            </div>
          </button>
          {side === 'left' ? (
            <LikeButton
              onVote={onVote}
              label={`Vote for ${displayName}`}
              pendingId={pendingVote?.id}
              shortcut="A"
              state={voteState}
            />
          ) : null}
          <div className="pointer-events-none absolute bottom-[8%] h-6 w-[42%] rounded-full bg-black/10 blur-xl" />
        </div>
      </div>
    </div>
  )
}

function LikeButton({
  label,
  onVote,
  pendingId,
  shortcut,
  state,
}: {
  label: string
  onVote: () => void
  pendingId?: string
  shortcut: 'A' | 'B'
  state: 'idle' | 'selected' | 'rejected'
}) {
  const isSelected = state === 'selected'
  const isRejected = state === 'rejected'
  const glyphTransition = { type: 'spring' as const, duration: 0.54, bounce: 0.16 }

  return (
    <button
      className={cn(
        'relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-zinc-300 bg-white text-black shadow-[0_16px_45px_rgba(15,23,42,0.1)] transition-[border-color,box-shadow,transform] duration-150 ease-out group-hover:scale-[1.03] hover:scale-[1.03] active:scale-[0.97] md:size-20',
        isSelected && 'border-emerald-500 shadow-[0_18px_50px_rgba(16,185,129,0.22)]',
        isRejected && 'border-zinc-200 text-zinc-500 shadow-[0_12px_34px_rgba(15,23,42,0.06)]',
      )}
      onClick={onVote}
      type="button"
      aria-label={label}
    >
      {isSelected ? (
        <motion.div
          key={pendingId}
          className="absolute inset-y-0 left-0 bg-emerald-500"
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: 4, ease: 'linear' }}
        />
      ) : null}
      <span className="relative z-10 grid place-items-center">
        <AnimatePresence mode="wait" initial={false}>
          {isSelected ? (
            <motion.span
              key="thumbs-up-selected"
              className="relative grid size-7 place-items-center md:size-8"
              initial={{ filter: 'blur(5px)', opacity: 0, rotate: -18, scale: 0.7, y: 6 }}
              animate={{ filter: 'blur(0px)', opacity: 1, rotate: 0, scale: 1, y: 0 }}
              exit={{ filter: 'blur(4px)', opacity: 0, rotate: 16, scale: 0.78, y: -4 }}
              transition={glyphTransition}
            >
              <ThumbsUp className="absolute size-7 text-black md:size-8" aria-hidden="true" />
              <motion.span
                key={`selected-icon-${pendingId}`}
                className="absolute grid size-7 place-items-center overflow-hidden text-white md:size-8"
                initial={{ clipPath: 'inset(0 100% 0 0)' }}
                animate={{ clipPath: 'inset(0 0% 0 0)' }}
                transition={{ duration: 4, ease: 'linear' }}
              >
                <ThumbsUp className="size-7 md:size-8" aria-hidden="true" />
              </motion.span>
            </motion.span>
          ) : isRejected ? (
            <motion.span
              key="thumbs-down-rejected"
              initial={{ filter: 'blur(5px)', opacity: 0, rotate: -20, scale: 0.72, y: -6 }}
              animate={{ filter: 'blur(0px)', opacity: 1, rotate: 0, scale: 1, y: 0 }}
              exit={{ filter: 'blur(4px)', opacity: 0, rotate: 16, scale: 0.78, y: 5 }}
              transition={glyphTransition}
            >
              <ThumbsDown className="size-7 md:size-8" aria-hidden="true" />
            </motion.span>
          ) : (
            <motion.span
              key={`idle-${shortcut}`}
              className="font-mono text-xl font-semibold tracking-[-0.04em] md:text-2xl"
              initial={{ filter: 'blur(4px)', opacity: 0, rotate: 12, scale: 0.78, y: 5 }}
              animate={{ filter: 'blur(0px)', opacity: 1, rotate: 0, scale: 1, y: 0 }}
              exit={{ filter: 'blur(5px)', opacity: 0, rotate: shortcut === 'A' ? -18 : 18, scale: 0.68, y: shortcut === 'A' ? -6 : 6 }}
              transition={glyphTransition}
            >
              {shortcut}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </button>
  )
}

function PersonMeta({
  displayName,
  rating,
  side,
  totalVotes,
  winRate,
}: {
  displayName: string
  rating: number
  side: 'left' | 'right'
  totalVotes: number
  winRate: number
}) {
  return (
    <div className={`max-w-[360px] ${side === 'right' ? 'md:ml-auto' : ''}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/35">Rank / pending</div>
      <h1 className={`mt-2 text-3xl font-semibold leading-none tracking-[-0.055em] transition-transform duration-200 ease-out sm:text-5xl ${side === 'left' ? 'group-hover:md:-translate-x-2' : 'group-hover:md:translate-x-2'}`}>{displayName}</h1>
      <div className={`mt-4 flex gap-5 text-sm text-black/55 ${side === 'right' ? 'md:justify-end' : ''}`}>
        <IconStat icon={<Star className="size-4" aria-hidden="true" />} value={String(rating)} />
        <IconStat icon={<Crown className="size-4" aria-hidden="true" />} value={`${winRate}%`} />
        <IconStat icon={<ThumbsUp className="size-4" aria-hidden="true" />} value={String(totalVotes)} />
      </div>
    </div>
  )
}

function IconStat({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      <span>{value}</span>
    </span>
  )
}

function VotingState({
  description,
  icon,
  title,
}: {
  description?: string
  icon: React.ReactNode
  title: string
}) {
  return (
    <div className="grid min-h-[calc(100svh-8rem)] place-items-center text-center">
      <div>
        <div className="mx-auto grid size-12 place-items-center text-black/50">{icon}</div>
        <h1 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">{title}</h1>
        {description ? <p className="mt-2 max-w-sm text-sm leading-6 text-black/52">{description}</p> : null}
      </div>
    </div>
  )
}
