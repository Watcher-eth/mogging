import Link from 'next/link'
import { useEffect, useState, type CSSProperties } from 'react'
import useSWR from 'swr'
import { TextMorph } from 'torph/react'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { MessageCircle } from '@/components/ui/mogging-glyphs'
import { MoggingIcon } from '@/components/ui/mogging-icon'
import { useSystemReducedMotion } from '@/hooks/use-system-reduced-motion'
import { apiGet } from '@/lib/api/client'
import { creatorNotificationsPath, type CreatorNotificationsFeed } from '@/lib/creator/announcements'
import styles from './creator-notifications.module.css'

const emptyFeed: CreatorNotificationsFeed = { announcements: [], messages: [] }
const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

function readSeen(key: string): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function CreatorNotifications({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const storageKey = `creator-announcements:seen:${userId}`
  const [seen, setSeen] = useState(() => readSeen(storageKey))
  const reduced = useSystemReducedMotion()
  const { data, error, mutate } = useSWR<CreatorNotificationsFeed>(
    [creatorNotificationsPath, userId],
    ([path]: [string, string]) => apiGet(path),
    { refreshInterval: 15_000, revalidateOnFocus: true, dedupingInterval: 5_000 },
  )
  const { announcements, messages = emptyFeed.messages } = data ?? emptyFeed
  const unreadAnnouncements = announcements.filter(item => !seen.includes(item.id))
  const unreadMessages = messages.filter(item => item.unread && !seen.includes(item.id))
  const count = unreadAnnouncements.length + unreadMessages.length
  const notifications = [...messages, ...announcements].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  const badge = count > 9 ? '9+' : String(count)

  useEffect(() => {
    function syncSeen(event: StorageEvent) {
      if (event.key === storageKey || event.key === null) setSeen(readSeen(storageKey))
    }
    window.addEventListener('storage', syncSeen)
    return () => window.removeEventListener('storage', syncSeen)
  }, [storageKey])

  useEffect(() => {
    if (!open || count === 0) return
    const ids = [...announcements, ...messages].map(item => item.id)
    const next = [...new Set([...ids, ...readSeen(storageKey), ...seen])].slice(0, 120)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* Keep read state in memory. */ }
    setSeen(next)
  }, [announcements, count, messages, open, seen, storageKey])

  return (
    <Dialog open={open} onOpenChange={nextOpen => { setOpen(nextOpen); if (nextOpen) void mutate() }}>
      <DialogTrigger type="button" aria-label={count ? `Notifications, ${count} unread` : 'Notifications'} className={styles.trigger}>
        <MoggingIcon name="reminder" size={21} />
        {count > 0 && <span aria-hidden="true" className={styles.badge}>{reduced ? badge : <TextMorph>{badge}</TextMorph>}</span>}
      </DialogTrigger>
      <DialogContent className={`creator-dialog ${styles.dialog}`} overlayClassName="bg-black/10 backdrop-blur-[2px]" data-creator-notifications="">
        <header className={styles.header}>
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription className="text-xs leading-5">Campaign updates and submission messages</DialogDescription>
        </header>
        {notifications.length > 0 ? (
          <ul className={styles.list}>
            {notifications.map((item, index) => (
              <li key={item.id} style={{ '--announcement-delay': `${Math.min(index, 4) * 26}ms` } as CSSProperties}>
                <DialogClose asChild>
                  <Link href={item.href} prefetch={false} className={styles.row}>
                    <span className={styles.symbol}>{'unread' in item ? <MessageCircle size={17} aria-hidden="true" /> : <MoggingIcon name="campaign" size={17} />}</span>
                    <span className={styles.copy}>
                      <span className={styles.title}>{item.title}</span>
                      <span>{item.description}</span>
                    </span>
                    <time dateTime={item.publishedAt}>{dateFormat.format(new Date(item.publishedAt))}</time>
                  </Link>
                </DialogClose>
              </li>
            ))}
          </ul>
        ) : error ? (
          <p className={styles.status} role="status">Couldn’t load notifications. <button type="button" onClick={() => void mutate()}>Try again</button></p>
        ) : (
          <p className={styles.status} role="status">{data ? 'You’re all caught up.' : 'Loading notifications…'}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
