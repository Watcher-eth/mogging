import { Loader2, RefreshCw, SlidersHorizontal, X } from 'lucide-react'
import Image from 'next/image'
import { motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSound } from '@web-kits/audio/react'
import useSWR, { useSWRConfig } from 'swr'
import { toast } from 'sonner'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import { filterSound, selectSound, voteSound } from '@/lib/audio/sounds'

type ComparisonPhoto = {
  id: string
  imageUrl: string
  name: string | null
  age: number | null
  gender: 'male' | 'female' | 'other'
  hairColor: string | null
  skinColor: string | null
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
const decisionWindowMs = 4_500
const ageFilters = ['all', '13-17', '18-24', '25-34', '35-44', '45+'] as const
const genderFilters = ['all', 'male', 'female'] as const
const hairColorFilters = ['all', 'black', 'brown', 'blond', 'red', 'gray', 'other'] as const
const skinColorFilters = ['all', 'very_light', 'light', 'white', 'tan', 'brown', 'black'] as const

export default function VotingPage() {
  const { mutate: mutateGlobal } = useSWRConfig()
  const playVote = useSound(voteSound)
  const playSelect = useSound(selectSound)
  const [ageBucket, setAgeBucket] = useState<(typeof ageFilters)[number]>('all')
  const [gender, setGender] = useState<(typeof genderFilters)[number]>('all')
  const [hairColor, setHairColor] = useState<(typeof hairColorFilters)[number]>('all')
  const [skinColor, setSkinColor] = useState<(typeof skinColorFilters)[number]>('all')
  const pairKey = `/api/compare?photoType=face&gender=${gender}&ageBucket=${ageBucket}&hairColor=${hairColor}&skinColor=${skinColor}`
  const { data: pair, error, isLoading, mutate } = useSWR<ComparisonPair>(pairKey, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
  })
  const visiblePair = pair ?? null
  const [pendingVote, setPendingVote] = useState<PendingVote | null>(null)
  const [transitionLoser, setTransitionLoser] = useState<{ id: string; side: 'left' | 'right' } | null>(null)
  const [decisionSeconds, setDecisionSeconds] = useState(5)
  const decisionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const decisionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const nextPairRef = useRef<ComparisonPair | null>(null)
  const pendingVoteRef = useRef<PendingVote | null>(null)
  const pairTimerKey = visiblePair ? `${visiblePair.left.id}-${visiblePair.right.id}` : 'empty'

  const submitVote = useCallback(async (winner: ComparisonPhoto, loser: ComparisonPhoto) => {
    try {
      await apiPost<VoteResponse>('/api/compare', {
        winnerPhotoId: winner.id,
        loserPhotoId: loser.id,
      })
      void mutateGlobal(photoLeaderboardKey)
      void mutateGlobal('/api/leaderboard/me')
    } catch (voteError) {
      toast.error(voteError instanceof ApiClientError ? voteError.message : 'Unable to submit vote')
    }
  }, [mutateGlobal])

  const prefetchNextPair = useCallback(async () => {
    try {
      nextPairRef.current = await apiGet<ComparisonPair>(pairKey)
    } catch {
      nextPairRef.current = null
    }
  }, [pairKey])

  const advancePair = useCallback(async () => {
    const committedVote = pendingVoteRef.current
    const nextPair = nextPairRef.current

    nextPairRef.current = null
    pendingVoteRef.current = null
    setTransitionLoser(null)
    setPendingVote(null)

    if (nextPair) {
      await mutate(nextPair, { revalidate: false })
    } else {
      await mutate()
    }

    if (committedVote) {
      playVote()
      toast.success(`Registered your vote for ${committedVote.winner.name || `${committedVote.winner.gender} face`}`)
      void submitVote(committedVote.winner, committedVote.loser)
    }
  }, [mutate, playVote, submitVote])

  useEffect(() => {
    pendingVoteRef.current = pendingVote
  }, [pendingVote])

  useEffect(() => {
    if (!visiblePair) return

    const deadline = Date.now() + decisionWindowMs
    setDecisionSeconds(5)
    void prefetchNextPair()

    decisionIntervalRef.current = setInterval(() => {
      setDecisionSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    }, 100)

    decisionTimerRef.current = setTimeout(() => {
      void advancePair()
    }, decisionWindowMs)

    return () => {
      if (decisionTimerRef.current) {
        clearTimeout(decisionTimerRef.current)
        decisionTimerRef.current = null
      }
      if (decisionIntervalRef.current) {
        clearInterval(decisionIntervalRef.current)
        decisionIntervalRef.current = null
      }
    }
  }, [advancePair, pairTimerKey, prefetchNextPair, visiblePair])

  const queueVote = useCallback((winner: ComparisonPhoto, loser: ComparisonPhoto, loserSide: 'left' | 'right') => {
    playSelect()
    setPendingVote({
      id: `${winner.id}-${Date.now()}`,
      loserSide,
      winner,
      loser,
    })
  }, [playSelect])

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
    pendingVoteRef.current = null
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
        <main className="isolate grid gap-7 sm:gap-12">
          <header
            className="relative z-[80] border-b border-zinc-200 bg-white pb-5 sm:pb-10"
            style={{ animation: 'battle-enter 560ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
          >
            <div className="grid gap-3 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <h1 className="max-w-4xl text-4xl font-semibold leading-[0.94] tracking-[-0.07em] sm:text-6xl lg:text-7xl">
                Who mogs harder?
              </h1>
              <div className="hidden items-end gap-3 justify-self-start sm:flex lg:justify-self-end">
                <BattleControls
                  ageBucket={ageBucket}
                  gender={gender}
                  hairColor={hairColor}
                  pendingVote={pendingVote}
                  pairTimerKey={pairTimerKey}
                  seconds={decisionSeconds}
                  skinColor={skinColor}
                  onAgeBucketChange={setAgeBucket}
                  onGenderChange={setGender}
                  onHairColorChange={setHairColor}
                  onSkinColorChange={setSkinColor}
                />
              </div>
            </div>
          </header>

          <div
            className="relative z-0 grid grid-cols-[minmax(0,1fr)_34px_minmax(0,1fr)] items-stretch gap-2 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_112px_minmax(0,1fr)]"
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

          <div className="relative z-[70] flex items-end justify-between gap-3 sm:hidden">
            <BattleControls
              ageBucket={ageBucket}
              gender={gender}
              hairColor={hairColor}
              pendingVote={pendingVote}
              pairTimerKey={pairTimerKey}
              seconds={decisionSeconds}
              skinColor={skinColor}
              onAgeBucketChange={setAgeBucket}
              onGenderChange={setGender}
              onHairColorChange={setHairColor}
              onSkinColorChange={setSkinColor}
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

function BattleControls({
  ageBucket,
  gender,
  hairColor,
  pendingVote,
  pairTimerKey,
  seconds,
  skinColor,
  onAgeBucketChange,
  onGenderChange,
  onHairColorChange,
  onSkinColorChange,
}: {
  ageBucket: (typeof ageFilters)[number]
  gender: (typeof genderFilters)[number]
  hairColor: (typeof hairColorFilters)[number]
  pendingVote: PendingVote | null
  pairTimerKey: string
  seconds: number
  skinColor: (typeof skinColorFilters)[number]
  onAgeBucketChange: (value: (typeof ageFilters)[number]) => void
  onGenderChange: (value: (typeof genderFilters)[number]) => void
  onHairColorChange: (value: (typeof hairColorFilters)[number]) => void
  onSkinColorChange: (value: (typeof skinColorFilters)[number]) => void
}) {
  return (
    <>
      <DecisionTimer
        pending={Boolean(pendingVote)}
        seconds={seconds}
        timerKey={pairTimerKey}
      />
      <BattleFilters
        ageBucket={ageBucket}
        gender={gender}
        hairColor={hairColor}
        skinColor={skinColor}
        onAgeBucketChange={onAgeBucketChange}
        onGenderChange={onGenderChange}
        onHairColorChange={onHairColorChange}
        onSkinColorChange={onSkinColorChange}
      />
    </>
  )
}

function BattleFilters({
  ageBucket,
  gender,
  hairColor,
  skinColor,
  onAgeBucketChange,
  onGenderChange,
  onHairColorChange,
  onSkinColorChange,
}: {
  ageBucket: (typeof ageFilters)[number]
  gender: (typeof genderFilters)[number]
  hairColor: (typeof hairColorFilters)[number]
  skinColor: (typeof skinColorFilters)[number]
  onAgeBucketChange: (value: (typeof ageFilters)[number]) => void
  onGenderChange: (value: (typeof genderFilters)[number]) => void
  onHairColorChange: (value: (typeof hairColorFilters)[number]) => void
  onSkinColorChange: (value: (typeof skinColorFilters)[number]) => void
}) {
  return (
    <FilterMenu
      align="right"
      filters={[
        { label: 'Gender', value: gender, values: genderFilters, onChange: (value) => onGenderChange(value as (typeof genderFilters)[number]) },
        { label: 'Age', value: ageBucket, values: ageFilters, onChange: (value) => onAgeBucketChange(value as (typeof ageFilters)[number]) },
        { label: 'Hair', value: hairColor, values: hairColorFilters, onChange: (value) => onHairColorChange(value as (typeof hairColorFilters)[number]) },
        { label: 'Skin', value: skinColor, values: skinColorFilters, onChange: (value) => onSkinColorChange(value as (typeof skinColorFilters)[number]) },
      ]}
    />
  )
}

type FilterMenuItem = {
  label: string
  value: string
  values: readonly string[]
  onChange: (value: string) => void
}

function FilterMenu({ align = 'right', filters }: { align?: 'left' | 'right'; filters: FilterMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const playFilter = useSound(filterSound)
  const activeCount = filters.filter((filter) => filter.value !== 'all').length

  useEffect(() => {
    if (!open) return

    function updateMenuPosition() {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return

      const width = Math.min(window.innerWidth * 0.84, 320)
      const preferredLeft = align === 'left' ? rect.left : rect.right - width
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, preferredLeft))
      setMenuStyle({
        left,
        top: rect.bottom + 10,
        width,
      })
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    updateMenuPosition()
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [align, open])

  return (
    <div className="relative w-fit">
      <button
        ref={buttonRef}
        aria-expanded={open}
        aria-label="Open filters"
        className="relative grid size-10 place-items-center rounded-full border border-zinc-200 bg-white text-black shadow-[0_10px_26px_rgba(15,23,42,0.06)] transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_16px_34px_rgba(15,23,42,0.1)] active:translate-y-0"
        onClick={() => {
          playFilter()
          setOpen((current) => !current)
        }}
        type="button"
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        {activeCount > 0 ? (
          <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-black font-mono text-[10px] font-semibold text-white">
            {activeCount}
          </span>
        ) : null}
      </button>

      {open && menuStyle && typeof document !== 'undefined' ? createPortal(
        <motion.div
          ref={panelRef}
          className="fixed z-[9999] rounded-[24px] border border-zinc-200 bg-white p-3 shadow-[0_24px_70px_rgba(15,23,42,0.16)]"
          style={menuStyle}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="grid gap-2">
            {filters.map((filter) => (
              <FilterMenuSelect key={filter.label} filter={filter} />
            ))}
          </div>
        </motion.div>,
        document.body
      ) : null}
    </div>
  )
}

function FilterMenuSelect({ filter }: { filter: FilterMenuItem }) {
  const playFilter = useSound(filterSound)

  return (
    <label className="grid gap-1.5 rounded-2xl px-2 py-1.5 transition-colors hover:bg-zinc-50">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">{filter.label}</span>
      <select
        className="h-10 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-semibold capitalize text-black outline-none transition-colors hover:border-zinc-300 focus:border-black"
        onChange={(event) => {
          playFilter()
          filter.onChange(event.target.value)
        }}
        value={filter.value}
      >
        {filter.values.map((option) => (
          <option key={option} value={option}>
            {formatFilterOption(option)}
          </option>
        ))}
      </select>
    </label>
  )
}

function formatFilterOption(option: string) {
  return option.replaceAll('_', ' ')
}

function DecisionTimer({
  pending,
  seconds,
  timerKey,
}: {
  pending: boolean
  seconds: number
  timerKey: string
}) {
  return (
    <div className="grid gap-2 justify-self-start lg:w-48 lg:justify-self-end lg:text-right">
      <div className="flex items-end justify-between gap-4 lg:justify-end">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
          {pending ? 'Vote locks in' : 'Press A or B'}
        </div>
        <div className="font-mono text-4xl font-semibold tabular-nums tracking-[-0.07em] text-black sm:text-5xl">
          {String(seconds).padStart(2, '0')}
        </div>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-zinc-200">
        <motion.div
          key={timerKey}
          className="h-full origin-left rounded-full bg-black"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: decisionWindowMs / 1000, ease: 'linear' }}
        />
      </div>
    </div>
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
        'group grid min-w-0 content-start gap-2 will-change-transform transition-opacity duration-500 ease-out sm:gap-4',
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
      <div className={`flex min-w-0 items-end justify-between gap-2 sm:gap-5 ${side === 'right' ? 'sm:flex-row-reverse sm:text-right' : ''}`}>
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500 sm:text-xs sm:tracking-[0.14em]">Rank</p>
          <h2 className="mt-1 truncate text-2xl font-semibold leading-none tracking-[-0.055em] sm:mt-2 sm:text-5xl sm:tracking-[-0.065em]">{displayName}</h2>
        </div>
        <div className="shrink-0 bg-white px-1.5 py-1 font-mono text-[10px] font-semibold sm:px-2 sm:text-xs">
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

      <div className={`grid grid-cols-3 gap-1 border-y border-zinc-300 py-2 sm:gap-0 sm:py-3 ${side === 'right' ? 'sm:text-right' : ''}`}>
        <Metric label="Score" value={formatVotingScore(photo.displayRating)} />
        <Metric label="PSL" value={formatPsl(photo.pslScore)} />
        <Metric label="Win" value={`${winRate}%`} />
      </div>
    </article>
  )
}

function BattleDivider() {
  return (
    <div className="grid place-items-center border-x border-zinc-200 px-1 lg:py-0">
      <div className="grid justify-items-center gap-2 sm:gap-4">
        <div className="h-10 w-px bg-zinc-200 sm:h-16" />
        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500 sm:text-xs sm:tracking-[0.16em]">VS</div>
        <div className="h-10 w-px bg-zinc-200 sm:h-16" />
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
          <motion.div
            key={renderedVote.id}
            className="h-full origin-left bg-black"
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: decisionWindowMs / 1000, ease: 'linear' }}
          />
        ) : null}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-mono text-[8px] uppercase tracking-[0.08em] text-zinc-500 sm:text-[10px] sm:tracking-[0.12em]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold tracking-[-0.04em] sm:text-lg">{value}</p>
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
