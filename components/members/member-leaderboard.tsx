import { MoggingIcon } from '@/components/ui/mogging-icon'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import useSWR from 'swr'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { apiGet } from '@/lib/api/client'
import type { MemberProfile } from '@/lib/users/member-pages'
import styles from './member-leaderboard.module.css'

type Entry = { rank: number; name: string; score: number; rating?: number | null; imageUrl?: string | null; isViewer?: boolean }
type Board = { items: Entry[]; hasMore: boolean }
type Gender = 'female' | 'male' | 'all'
type Scope = 'global' | 'friends'
const accents = ['#8854f6', '#f5a124', '#36aeed']
function Avatar({ name, src }: { name: string; src?: string | null }) {
  const [failed, setFailed] = useState(false)
  return <span className={styles.avatar} aria-hidden="true">{src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : name.trim().slice(0, 1).toUpperCase() || '•'}</span>
}

export function MemberLeaderboard({ preview, profile, onInvite, onSettings, mobile = false }: {
  preview: boolean; profile?: MemberProfile; onInvite: () => void; onSettings: () => void; mobile?: boolean
}) {
  const [page, setPage] = useState(1)
  const [gender, setGender] = useState<Gender>('female')
  const [scope, setScope] = useState<Scope>('global')
  const [selected, setSelected] = useState<Entry | null>(null)
  const reduced = useReducedMotion()
  const { data: board, error, mutate } = useSWR<Board>(`/api/leaderboard/members?page=${page}&scope=${scope}&gender=${gender}${mobile ? '&order=battle' : ''}${preview ? '&preview=1' : ''}`, apiGet)
  const { data: settings } = useSWR<{ isPublic: boolean }>(preview ? null : '/api/user/member-settings', apiGet)

  const showInvite = scope === 'friends' && board && !board.items.some(item => !item.isViewer)
  const podium = page === 1 ? board?.items.slice(0, 3) ?? [] : []
  const rows = page === 1 ? board?.items.slice(3) ?? [] : board?.items ?? []

  const rating = (entry: Entry) => mobile ? entry.rating?.toLocaleString('en-US') ?? '—' : entry.score.toFixed(1)
  const ratingLabel = mobile ? 'Battle rating' : 'Overall score'

  return <section className={styles.board} data-mobile={mobile || undefined}>
    <header className={styles.header}>
      <h1>Leaderboard</h1>
      <div>
        <label className={styles.filter} data-filtered={gender !== 'female' || undefined} title="Leaderboard gender filter">
          <MoggingIcon name="filter" size={20} /><select aria-label="Leaderboard gender filter" value={gender} onChange={event => { setGender(event.target.value as Gender); setPage(1) }}>
            <option value="female">Female</option><option value="male">Male</option><option value="all">All</option>
          </select>
        </label>
        <button type="button" className={styles.round} aria-label="Invite friends" onClick={onInvite}><MoggingIcon name="invite" size={20} /></button>
      </div>
    </header>
    <LayoutGroup id="member-leaderboard-scope"><div className={styles.segment} role="group" aria-label="Leaderboard scope">
      {(['global', 'friends'] as const).map(value => <button key={value} type="button" aria-pressed={scope === value} onClick={() => { setScope(value); setPage(1) }}>
        {scope === value && <motion.span layoutId="leaderboard-scope" transition={{ duration: reduced ? 0 : .38, ease: [.22, 1, .36, 1] }} />}
        {value === 'global' ? 'Global' : 'Friends'}
      </button>)}
    </div></LayoutGroup>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={`${scope}:${gender}:${page}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : mobile ? .45 : .18, ease: 'easeOut' }}>
        {showInvite ? <motion.div className={styles.friends}
          initial={!mobile || reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : .65, ease: 'easeOut' }}>
          <MoggingIcon name="leaderboard" size={33} style={{ color: '#e0a128' }} /><h2>Better with your friends.</h2>
          <p>Invite your friends to Mogging. Once they join with a public profile, you can compare rankings together.</p>
          <div className={styles.friendAvatars}>
            {[['Your friend', '6.8', '/scan/leaderboard/friend-man.jpg'], ['You', profile?.score?.toFixed(1) ?? '—', profile?.imageUrl], ['Your friend', '7.4', '/scan/leaderboard/friend-woman.jpg']].map(([name, score, image], index) =>
              <div key={index}><div><Avatar name={name ?? ''} src={image} /><b>{score}</b></div><small>{name}</small></div>)}
          </div>
          <small>Overall scores / 10 · Friend scores are examples</small>
          <button type="button" className="scan-home-primary" onClick={onInvite}>Invite friends</button>
        </motion.div> : <>
          {podium.length > 0 && <div className={styles.podium} aria-label="Leaderboard podium">
            {[1, 0, 2].map(index => {
              const entry = podium[index]
              if (!entry) return <div key={index} />
              return <motion.button type="button" className={styles.place} onClick={() => setSelected(entry)} aria-label={`${entry.name}, rank ${entry.rank}, ${ratingLabel} ${rating(entry)}`} key={entry.rank} data-place={index + 1}
                style={{ '--place-color': accents[index] } as React.CSSProperties}
                initial={reduced ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduced ? 0 : mobile ? .75 : .45, delay: reduced ? 0 : index * (mobile ? .18 : .07), ease: [.22, 1, .36, 1] }}>
                <strong>{entry.name}</strong>
                <div className={styles.medal}><Avatar key={entry.imageUrl} name={entry.name} src={entry.imageUrl} /><b>{rating(entry)}</b></div>
                <div className={styles.stand}><span>{['1st', '2nd', '3rd'][index]}</span></div>
              </motion.button>
            })}
          </div>}
          <button type="button" className={styles.join} onClick={onSettings}>
            {settings?.isPublic ? <MoggingIcon name="verified" size={23} style={{ color: '#32a878' }} /> : <MoggingIcon name="leaderboard" size={23} />}
            <span><b>{settings?.isPublic ? 'You’re on the leaderboard' : 'Your place is waiting'}</b>
              <small>{settings?.isPublic ? 'Manage your listing in Settings' : 'Make your profile public to join'}</small></span>
            <MoggingIcon name="chevron-right" size={16} />
          </button>
          {rows.length > 0 && <div className={styles.rankings}>
            <div className={styles.rankingsHead}><span>Rankings</span><span>{ratingLabel}</span></div>
            <ol start={rows[0].rank}>{rows.map(entry => <li key={entry.rank}>
              <button type="button" onClick={() => setSelected(entry)}>
                <span>{entry.rank}</span><Avatar key={entry.imageUrl} name={entry.name} src={entry.imageUrl} /><b>{entry.name}</b><strong>{rating(entry)}</strong>
              </button>
            </li>)}</ol>
          </div>}
          {(!board || !board.items.length) && <div className={styles.empty} role={error ? 'alert' : 'status'}>
            {error ? <button type="button" onClick={() => void mutate()}>Couldn’t load rankings. Retry</button>
              : board ? <><MoggingIcon name="people" size={30} /><b>Be one of the first</b><span>Public profiles will appear here as people join.</span></> : 'Loading rankings…'}
          </div>}
          {(page > 1 || board?.hasMore) && <nav className={styles.pages} aria-label="Leaderboard pages">
            <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>{page}</span><button type="button" disabled={!board?.hasMore || page >= 1000} onClick={() => setPage(page + 1)}>Next</button>
          </nav>}
        </>}
      </motion.div>
    </AnimatePresence>
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null) }}>
      <DialogContent className={styles.rankingDialog}>
        {selected && <>
          <DialogTitle>{selected.name}</DialogTitle>
          <DialogDescription>#{selected.rank} · {ratingLabel} {rating(selected)}</DialogDescription>
          {selected.imageUrl && <img src={selected.imageUrl} alt="" />}
        </>}
      </DialogContent>
    </Dialog>
  </section>
}
