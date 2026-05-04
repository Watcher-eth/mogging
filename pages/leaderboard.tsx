import { motion } from 'motion/react'
import { SlidersHorizontal } from 'lucide-react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useSound } from '@web-kits/audio/react'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'
import { apiGet } from '@/lib/api/client'
import { filterSound } from '@/lib/audio/sounds'

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
  age?: number | null
  gender?: string | null
  hairColor?: string | null
  skinColor?: string | null
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

const leaderboardPageSize = 15
const podiumOrder = [1, 0, 2]
const instagramLogoUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Instagram_logo_2016.svg/3840px-Instagram_logo_2016.svg.png'
const tiktokLogoUrl = 'https://cdn.simpleicons.org/tiktok/000000'
const genderFilters = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'All', value: 'all' },
] as const
type LeaderboardGender = (typeof genderFilters)[number]['value']
const leaderboardAgeFilters = ['all', '13-17', '18-24', '25-34', '35-44', '45+'] as const
const leaderboardHairFilters = ['all', 'black', 'brown', 'blond', 'red', 'gray', 'other'] as const
const leaderboardSkinFilters = ['all', 'very_light', 'light', 'white', 'tan', 'brown', 'black'] as const

export default function LeaderboardPage() {
  const { status } = useSession()
  const playFilter = useSound(filterSound)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const [ageBucket, setAgeBucket] = useState<(typeof leaderboardAgeFilters)[number]>('all')
  const [gender, setGender] = useState<LeaderboardGender>('male')
  const [hairColor, setHairColor] = useState<(typeof leaderboardHairFilters)[number]>('all')
  const [skinColor, setSkinColor] = useState<(typeof leaderboardSkinFilters)[number]>('all')
  const {
    data: leaderboardPages,
    error: leaderboardError,
    isValidating: isLeaderboardValidating,
    setSize,
    size,
  } = useSWRInfinite<LeaderboardResponse>((pageIndex, previousPage) => {
    if (previousPage && previousPage.items.length === 0) return null
    return `/api/leaderboard/photos?limit=${leaderboardPageSize}&page=${pageIndex + 1}&sort=rating&gender=${gender}&ageBucket=${ageBucket}&hairColor=${hairColor}&skinColor=${skinColor}`
  }, apiGet, {
    revalidateOnFocus: true,
    revalidateFirstPage: false,
  })
  const { data: currentUserRank } = useSWR<CurrentUserRankResponse>(
    status === 'authenticated' ? '/api/leaderboard/me' : null,
    {
      refreshInterval: 2_000,
      revalidateOnFocus: true,
      shouldRetryOnError: false,
    }
  )
  const entries = useMemo(() => leaderboardPages?.flatMap((page) => page.items) ?? [], [leaderboardPages])
  const total = leaderboardPages?.[0]?.total ?? 0
  const hasMore = entries.length < total
  const isInitialLoading = !leaderboardPages && !leaderboardError
  const isLoadingMore = isLeaderboardValidating && hasMore

  const topThree = useMemo(() => entries.slice(0, 3), [entries])
  const rankedEntries = useMemo(() => entries.slice(3), [entries])

  useEffect(() => {
    void setSize(1)
  }, [ageBucket, gender, hairColor, skinColor, setSize])

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node || !hasMore) return

    const observer = new IntersectionObserver(
      (observedEntries) => {
        if (!observedEntries[0]?.isIntersecting || isLeaderboardValidating) return
        void setSize((currentSize) => currentSize + 1)
      },
      { rootMargin: '700px 0px' }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, isLeaderboardValidating, setSize, size])

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
      <div className="isolate grid w-full gap-14">
        <header
          className="relative z-[80] border-b border-zinc-200 bg-white pb-10"
          style={{ animation: 'leaderboard-enter 560ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <h1 className="max-w-4xl text-4xl font-semibold leading-[0.94] tracking-[-0.07em] sm:text-6xl lg:text-7xl">
              Global Leaderboard
            </h1>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <div className="grid h-11 grid-cols-3 rounded-full border border-zinc-200 bg-zinc-50 p-1 sm:w-[260px]">
                {genderFilters.map((filter) => (
                  <button
                    key={filter.value}
                    className={`relative isolate overflow-hidden rounded-full text-xs font-semibold transition-colors duration-200 ease-out ${
                      gender === filter.value ? 'text-black' : 'text-zinc-500 hover:text-black'
                    }`}
                    onClick={() => {
                      playFilter()
                      setGender(filter.value)
                    }}
                    type="button"
                  >
                    {gender === filter.value ? (
                      <motion.span
                        layoutId="leaderboard-gender-pill"
                        className="absolute inset-0 -z-10 rounded-full bg-white shadow-[0_8px_22px_rgba(15,23,42,0.08)]"
                        transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }}
                      />
                    ) : null}
                    <span className="relative z-10">{filter.label}</span>
                  </button>
                ))}
              </div>
              <LeaderboardFilterMenu
                ageBucket={ageBucket}
                hairColor={hairColor}
                skinColor={skinColor}
                onAgeBucketChange={setAgeBucket}
                onHairColorChange={setHairColor}
                onSkinColorChange={setSkinColor}
              />
            </div>
          </div>
        </header>

        <div key={`${gender}-${ageBucket}-${hairColor}-${skinColor}`} className="relative z-0 grid gap-16" style={{ animation: 'leaderboard-enter 420ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
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
            <div className="grid grid-cols-[48px_minmax(0,1fr)_72px] gap-3 border-b border-zinc-200 pb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500 sm:grid-cols-[64px_minmax(0,1fr)_96px_96px_120px] sm:gap-4">
              <span>Rank</span>
              <span>Profile</span>
              <span className="text-right">Score</span>
              <span className="hidden text-right sm:block">PSL</span>
              <span className="hidden text-right sm:block">Social</span>
            </div>

            <div className="grid">
              {rankedEntries.length > 0 ? (
                rankedEntries.map((entry, index) => (
                  <RankRow key={entry.id || entry.photoId || entry.rank} entry={entry} index={index} />
                ))
              ) : isInitialLoading ? (
                <div className="border-b border-zinc-200 py-10 text-sm text-zinc-500">
                  Loading ranks...
                </div>
              ) : (
                <div className="border-b border-zinc-200 py-10 text-sm text-zinc-500">
                  No ranked photos yet.
                </div>
              )}
              <div ref={loadMoreRef} className="grid min-h-16 place-items-center border-b border-zinc-200 py-5">
                {hasMore ? (
                  <button
                    className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500 transition-colors hover:text-black disabled:opacity-50"
                    disabled={isLoadingMore}
                    onClick={() => void setSize((currentSize) => currentSize + 1)}
                    type="button"
                  >
                    {isLoadingMore ? 'Loading more...' : 'Load more'}
                  </button>
                ) : entries.length > 0 ? (
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400">End of leaderboard</span>
                ) : null}
              </div>
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
        <div className={elevated ? 'relative aspect-[3/4]' : 'relative aspect-[3/3.65]'}>
          <Image
            alt=""
            className="object-cover grayscale-[0.1] transition duration-500 ease-out group-hover:scale-[1.035]"
            src={entry.imageUrl || '/model.png'}
            fill
            priority={entry.rank <= 3}
            sizes="(min-width: 640px) 230px, 80vw"
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
              PSL / {formatPsl(entry.pslScore)}
            </p>
          </div>
          <div className="text-right text-3xl font-semibold tracking-[-0.06em]">
            {formatVotingScore(displayScore(entry))}
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

type LeaderboardFilterItem = {
  label: string
  value: string
  values: readonly string[]
  onChange: (value: string) => void
}

function LeaderboardFilterMenu({
  ageBucket,
  hairColor,
  skinColor,
  onAgeBucketChange,
  onHairColorChange,
  onSkinColorChange,
}: {
  ageBucket: (typeof leaderboardAgeFilters)[number]
  hairColor: (typeof leaderboardHairFilters)[number]
  skinColor: (typeof leaderboardSkinFilters)[number]
  onAgeBucketChange: (value: (typeof leaderboardAgeFilters)[number]) => void
  onHairColorChange: (value: (typeof leaderboardHairFilters)[number]) => void
  onSkinColorChange: (value: (typeof leaderboardSkinFilters)[number]) => void
}) {
  return (
    <FilterMenu
      filters={[
        { label: 'Age', value: ageBucket, values: leaderboardAgeFilters, onChange: (value) => onAgeBucketChange(value as (typeof leaderboardAgeFilters)[number]) },
        { label: 'Hair', value: hairColor, values: leaderboardHairFilters, onChange: (value) => onHairColorChange(value as (typeof leaderboardHairFilters)[number]) },
        { label: 'Skin', value: skinColor, values: leaderboardSkinFilters, onChange: (value) => onSkinColorChange(value as (typeof leaderboardSkinFilters)[number]) },
      ]}
    />
  )
}

function FilterMenu({ align = 'left', filters }: { align?: 'left' | 'right'; filters: LeaderboardFilterItem[] }) {
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
    <div className="relative">
      <button
        ref={buttonRef}
        aria-expanded={open}
        aria-label="Open filters"
        className="relative grid size-11 place-items-center rounded-full border border-zinc-200 bg-white text-black shadow-[0_10px_26px_rgba(15,23,42,0.06)] transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_16px_34px_rgba(15,23,42,0.1)] active:translate-y-0"
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
              <LeaderboardFilterSelect key={filter.label} filter={filter} />
            ))}
          </div>
        </motion.div>,
        document.body
      ) : null}
    </div>
  )
}

function LeaderboardFilterSelect({ filter }: { filter: LeaderboardFilterItem }) {
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

function RankRow({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  return (
    <article
      className="group grid grid-cols-[48px_minmax(0,1fr)_72px] items-center gap-3 border-b border-zinc-200 py-4 transition-colors duration-200 hover:bg-zinc-50 sm:grid-cols-[64px_minmax(0,1fr)_96px_96px_120px] sm:gap-4"
      style={{
        animation: `leaderboard-enter 480ms cubic-bezier(0.22, 1, 0.36, 1) ${180 + index * 35}ms both`,
      }}
    >
      <span className="font-mono text-sm text-zinc-500">{String(entry.rank).padStart(2, '0')}</span>
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <span className="relative block size-12 shrink-0 overflow-hidden rounded-full bg-zinc-100">
          <Image
            alt=""
            className="object-cover grayscale-[0.1] transition-transform duration-300 ease-out group-hover:scale-105"
            src={entry.imageUrl || '/model.png'}
            fill
            sizes="48px"
          />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-[-0.04em] sm:truncate">{entry.name || 'Anonymous'}</h3>
          <p className="mt-1 hidden truncate font-mono text-xs uppercase tracking-[0.1em] text-zinc-500 sm:block">
            H {formatSmallMetric(entry.harmonyScore)} / D {formatSmallMetric(entry.dimorphismScore)} / A {formatSmallMetric(entry.angularityScore)}
          </p>
          <MobileSocialLink social={entry.social} />
        </div>
      </div>
      <span className="text-right text-xl font-semibold tracking-[-0.05em]">{formatVotingScore(displayScore(entry))}</span>
      <span className="hidden text-right font-mono text-xs text-zinc-500 sm:block">{formatPsl(entry.pslScore)}</span>
      <SocialLink social={entry.social} />
    </article>
  )
}

function SocialLink({ social }: { social?: string | null }) {
  const parsed = parseSocial(social)

  if (!parsed) {
    return <span className="hidden text-right text-sm text-zinc-500 sm:block">-</span>
  }

  return (
    <a
      className="hidden min-w-0 items-center justify-end gap-2 text-right text-sm text-zinc-500 transition-colors hover:text-black sm:flex"
      href={parsed.url}
      rel="noopener noreferrer"
      target="_blank"
    >
      <Image className="shrink-0 object-contain" src={parsed.logoUrl} alt="" width={16} height={16} sizes="16px" />
      <span className="truncate">{parsed.username}</span>
    </a>
  )
}

function MobileSocialLink({ social }: { social?: string | null }) {
  const parsed = parseSocial(social)
  if (!parsed) return null

  return (
    <a
      className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-black sm:hidden"
      href={parsed.url}
      rel="noopener noreferrer"
      target="_blank"
    >
      <Image className="shrink-0 object-contain" src={parsed.logoUrl} alt="" width={14} height={14} sizes="14px" />
      <span className="truncate">{parsed.username}</span>
    </a>
  )
}

function CurrentUserRankBar({ entry }: { entry: LeaderboardEntry | null }) {
  if (!entry) return null

  return (
    <div className="fixed inset-x-5 bottom-5 z-40 mx-auto max-w-3xl border border-black bg-white px-4 py-3 text-black shadow-[0_18px_50px_rgba(15,23,42,0.12)] sm:bottom-6">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
        <span className="relative block size-12 shrink-0 overflow-hidden rounded-full bg-zinc-100">
          <Image
            alt=""
            className="object-cover grayscale-[0.1]"
            src={entry.imageUrl || '/model.png'}
            fill
            sizes="48px"
          />
        </span>
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

function formatVotingScore(score?: number | null) {
  if (typeof score !== 'number') return '-'
  return Math.round(score).toLocaleString()
}

function formatSmallMetric(score?: number | null) {
  if (typeof score !== 'number') return '--'
  return String(Math.round(score))
}

function formatPsl(score?: number | null) {
  if (typeof score !== 'number') return '-'
  return score.toFixed(1)
}

function parseSocial(social?: string | null) {
  const value = social?.trim()
  if (!value) return null

  const normalizedValue = value.replace(/^@/, '')
  const lowerValue = normalizedValue.toLowerCase()

  if (lowerValue.includes('tiktok.com') || lowerValue.startsWith('tiktok:')) {
    const username = getSocialUsername(normalizedValue, 'tiktok') ?? normalizedValue
    return {
      platform: 'tiktok' as const,
      username: `@${username.replace(/^@/, '')}`,
      url: normalizedValue.startsWith('http') ? normalizedValue : `https://www.tiktok.com/@${username.replace(/^@/, '')}`,
      logoUrl: tiktokLogoUrl,
    }
  }

  if (lowerValue.includes('instagram.com') || lowerValue.startsWith('instagram:') || !lowerValue.includes('://')) {
    const username = getSocialUsername(normalizedValue, 'instagram') ?? normalizedValue
    return {
      platform: 'instagram' as const,
      username: `@${username.replace(/^@/, '')}`,
      url: normalizedValue.startsWith('http') ? normalizedValue : `https://www.instagram.com/${username.replace(/^@/, '')}/`,
      logoUrl: instagramLogoUrl,
    }
  }

  return null
}

function getSocialUsername(value: string, platform: 'instagram' | 'tiktok') {
  if (value.startsWith(`${platform}:`)) return value.slice(platform.length + 1).replace(/^@/, '')

  try {
    const url = new URL(value)
    const pathPart = url.pathname.split('/').filter(Boolean)[0]
    return pathPart?.replace(/^@/, '') || null
  } catch {
    return value.replace(/^@/, '')
  }
}

function displayScore(entry: LeaderboardEntry) {
  return entry.displayRating
}

function scorePercent(score?: number | null) {
  if (typeof score !== 'number') return 0
  return Math.max(0, Math.min(100, (score / 2000) * 100))
}
