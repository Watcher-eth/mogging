import { useEffect, useRef, useState } from 'react'
import { useSWRConfig } from 'swr'
import useSWRInfinite from 'swr/infinite'
import { ArrowUp, Loader2, MessageCircle } from 'lucide-react'
import { apiGet, apiPatch, apiPost } from '@/lib/api/client'
import { cn } from '@/lib/utils'

type Message = { id: string; authorRole: 'creator' | 'team'; body: string; createdAt: string }
type Thread = { submission: { status: string; unreadMessages: number }; messages: Message[]; nextCursor: string | null }

export function SubmissionConversation({ submissionId, viewerRole }: { submissionId: string; viewerRole: Message['authorRole'] }) {
  const endpoint = `/api/${viewerRole === 'team' ? 'admin/creator' : 'creator'}/submissions/${encodeURIComponent(submissionId)}/messages`
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<Thread>((index, previous) => index === 0 ? endpoint : previous?.nextCursor ? `${endpoint}?cursor=${encodeURIComponent(previous.nextCursor)}` : null, apiGet, { refreshInterval: 10_000 })
  const { mutate: refreshDashboard } = useSWRConfig()
  const readInFlight = useRef(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const retry = useRef<{ id: string; body: string } | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const previousHeight = useRef<number | null>(null)
  const messages = [...new Map([...(data || [])].reverse().flatMap(page => page.messages).map(message => [message.id, message])).values()]
  useEffect(() => {
    if (!composer.current) return
    composer.current.style.height = 'auto'
    composer.current.style.height = `${Math.min(composer.current.scrollHeight, 112)}px`
  }, [draft])
  const messageKey = messages.map(message => message.id).join(',')
  useEffect(() => {
    const el = scroll.current
    if (!el) return
    if (previousHeight.current !== null) { el.scrollTop += el.scrollHeight - previousHeight.current; previousHeight.current = null }
    else if (atBottom) el.scrollTop = el.scrollHeight
  }, [messageKey, atBottom])

  useEffect(() => {
    const el = scroll.current
    if (!el || !atBottom) return
    const observer = new ResizeObserver(() => { el.scrollTop = el.scrollHeight })
    observer.observe(el)
    return () => observer.disconnect()
  }, [atBottom])

  useEffect(() => {
    const latest = data?.[0]?.messages.at(-1)
    if (!atBottom || !latest || !data?.[0]?.submission.unreadMessages || readInFlight.current) return
    readInFlight.current = true
    void apiPatch(endpoint, { messageId: latest.id }).then(async () => {
      await Promise.all([refreshDashboard('/api/creator'), refreshDashboard('/api/admin/creator'), mutate()])
    }).catch(() => { /* Keep unread counts; the next poll retries the read receipt. */ }).finally(() => { readInFlight.current = false })
  }, [atBottom, data, endpoint, refreshDashboard, mutate])

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    const input = retry.current?.body === body ? retry.current : { id: crypto.randomUUID(), body }
    retry.current = input
    setSending(true); setSendError(null)
    try {
      await apiPost(endpoint, input)
      retry.current = null; setDraft(''); setAtBottom(true)
      await mutate()
    } catch (cause) { setSendError(cause instanceof Error ? cause.message : 'Could not send. Try again.') }
    finally { setSending(false) }
  }

  return <section className="flex h-[min(60dvh,520px)] min-h-[300px] flex-col bg-white" aria-label="Submission conversation">
    <div className="border-b border-zinc-100 px-5 py-3 text-center"><p className="text-sm font-semibold">{viewerRole === 'creator' ? 'Mogging team' : 'Creator conversation'}</p><p className="mt-0.5 text-xs capitalize text-zinc-500">{data?.[0]?.submission.status.replaceAll('_', ' ') || 'Review & feedback'}</p></div>
    <div ref={scroll} onScroll={() => { const el = scroll.current; if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80) }} className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6" role="log" aria-label="Messages" aria-live="polite">
      {data?.[size - 1]?.nextCursor ? <button className="mx-auto mb-5 block min-h-11 text-xs font-medium text-[#007aff]" disabled={isValidating} onClick={() => { previousHeight.current = scroll.current?.scrollHeight ?? null; void setSize(size + 1) }}>Load earlier messages</button> : null}
      {isLoading ? <Loader2 className="mx-auto my-10 size-5 animate-spin text-zinc-400" /> : null}
      {error ? <div className="my-5 text-center text-sm text-red-600">Could not load the conversation. <button className="underline" onClick={() => void mutate()}>Try again</button></div> : null}
      {!isLoading && !error && !messages.length ? <div className="grid h-full place-content-center text-center text-zinc-400"><MessageCircle className="mx-auto mb-3 size-8" /><p className="text-sm font-medium text-zinc-600">Your review conversation starts here</p><p className="mt-1 max-w-64 text-xs leading-5">Ask a question or share feedback about this submission.</p></div> : null}
      {messages.map((message, index) => {
        const outgoing = message.authorRole === viewerRole
        const date = new Date(message.createdAt)
        const showDate = index === 0 || new Date(messages[index - 1].createdAt).toDateString() !== date.toDateString()
        return <div key={message.id}>{showDate ? <p className="mb-4 mt-2 text-center text-[11px] font-medium text-zinc-400">{date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p> : null}<div className={cn('mb-3 flex flex-col', outgoing ? 'items-end' : 'items-start')}><div data-outgoing={outgoing} className={cn('bubble relative max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] px-4 py-2.5 text-[14px] leading-[1.45] sm:max-w-[78%]', outgoing ? 'bg-[#007aff] text-white' : 'bg-[#e9e9eb] text-zinc-900')}>{message.body}</div><time dateTime={message.createdAt} className="mt-1 px-1 text-[10px] text-zinc-400">{message.authorRole === 'team' && !outgoing ? 'Mogging · ' : ''}{date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time></div></div>
      })}
    </div>
    <form onSubmit={event => { event.preventDefault(); void send() }} className="border-t border-zinc-100 p-3 sm:px-5">
      {sendError ? <p role="alert" className="mb-2 text-xs text-red-600">{sendError}</p> : null}
      <div className="flex items-end gap-2 rounded-[24px] border border-zinc-300 bg-white py-1 focus-within:border-[#007aff] pl-4 pr-1"><textarea ref={composer} aria-label="Message" placeholder="Message" rows={1} maxLength={2000} value={draft} disabled={sending} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} className="max-h-28 min-h-10 flex-1 resize-none border-0 bg-transparent py-2.5 text-sm outline-none" /><button type="submit" aria-label="Send message" disabled={sending || !draft.trim()} className="grid size-10 shrink-0 place-items-center !rounded-full p-0 text-white transition-opacity disabled:opacity-35"><span className="grid size-8 place-items-center rounded-full bg-[#007aff]">{sending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}</span></button></div>
    </form>
    <style jsx>{`
      .bubble::before, .bubble::after { content: ''; position: absolute; bottom: 0; height: 20px; }
      .bubble::before { width: 20px; background: inherit; }
      .bubble::after { width: 26px; background: white; }
      .bubble[data-outgoing="true"]::before { right: -7px; border-bottom-left-radius: 16px; }
      .bubble[data-outgoing="true"]::after { right: -26px; border-bottom-left-radius: 10px; }
      .bubble[data-outgoing="false"]::before { left: -7px; border-bottom-right-radius: 16px; }
      .bubble[data-outgoing="false"]::after { left: -26px; border-bottom-right-radius: 10px; }
    `}</style>
  </section>
}
