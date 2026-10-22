import { useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { apiGet, apiPatch, apiPost } from '@/lib/api/client'
import { creatorCaption, creatorCtaOverlay } from '@/lib/creator/post-guidance'
import { sprintPhase, type CreatorSprint } from '@/lib/creator/sprints'
import type { CreatorDashboard } from './types'
import { fieldClass } from './creator-shell'

export function RegisteredPosts({ data, onChange }: { data: CreatorDashboard; onChange: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false)
  const [sprintId, setSprintId] = useState(''), [accountId, setAccountId] = useState(''), [formatId, setFormatId] = useState('')
  const { data: campaigns } = useSWR<{ sprints: CreatorSprint[] }>(open ? '/api/creator/sprints' : null, apiGet)
  const sprint = campaigns?.sprints.find(item => item.id === sprintId)
  const posts = data.registeredPosts || []
  async function register(event: FormEvent) {
    event.preventDefault(); setBusy(true)
    try {
      await apiPost('/api/creator/posts', { sprintId, socialAccountId: accountId, formatId })
      await onChange(); setOpen(false); toast.success('Your post link and caption are ready')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not register post') }
    finally { setBusy(false) }
  }
  return <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Track your post from the start</h2><p className="mt-1 max-w-xl text-sm leading-6 text-zinc-500">Get a link and creator code before posting. Add the published post here at any view count; request paid review when it qualifies.</p></div><Button type="button" variant="outline" className="min-h-11 rounded-full" onClick={() => setOpen(value => !value)}>{open ? 'Close' : 'Prepare a post'}</Button></div>
    {open ? <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={register}>
      <label className="grid gap-1.5 text-sm">Campaign<select required className={fieldClass} value={sprintId} onChange={event => { setSprintId(event.target.value); setFormatId('') }}><option value="">Choose campaign</option>{campaigns?.sprints.filter(item => sprintPhase(item) === 'active').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm">Account<select required className={fieldClass} value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">Choose account</option>{data.socialAccounts.filter(item => item.status === 'approved' && (!sprint || sprint.terms.platforms.includes(item.platform))).map(item => <option key={item.id} value={item.id}>{item.platform} · @{item.handle}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm">Format<select required className={fieldClass} value={formatId} onChange={event => setFormatId(event.target.value)}><option value="">Choose format</option>{sprint?.terms.formats.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <Button disabled={busy} className="min-h-11 self-end rounded-full">{busy ? 'Preparing…' : 'Create post link and caption'}</Button>
    </form> : null}
    {posts.length ? <div className="mt-4 grid gap-3">{posts.map(post => <RegisteredPost key={post.id} post={post} onChange={onChange} />)}</div> : null}
  </section>
}

function RegisteredPost({ post, onChange }: { post: NonNullable<CreatorDashboard['registeredPosts']>[number]; onChange: () => Promise<unknown> }) {
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false)
  const code = post.code || '', link = `https://www.mogging.com/r/${code}`
  const caption = creatorCaption(code), overlay = creatorCtaOverlay(code)
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); toast.success('Copied') } catch { toast.error('Copy unavailable. Select and copy the text below.') }
  }
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget); setBusy(true)
    try {
      await apiPatch('/api/creator/posts', { id: post.id, postUrl: fields.get('postUrl'), caption: fields.get('caption'), postedAt: new Date(String(fields.get('postedAt'))).toISOString() })
      await onChange(); setEditing(false); toast.success('Published post saved. Submit analytics when it qualifies.')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save post') }
    finally { setBusy(false) }
  }
  return <article className="rounded-xl bg-zinc-50 p-4"><p className="text-sm font-medium">{post.platform} · {post.title}</p><p className="mt-2 select-all break-all font-mono text-sm text-sky-700">{link}</p><p className="mt-2 text-xs leading-5 text-zinc-500">Show the code clearly within your early product moment. A shared bio link tracks your account; this post’s link/code tracks this specific post.</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" type="button" onClick={() => void copy(link)}>Copy link</Button><Button variant="outline" type="button" onClick={() => void copy(caption)}>Copy caption</Button><Button variant="outline" asChild><a href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(overlay)}`} download={`${code}-cta.svg`}>Download CTA overlay</a></Button><Button variant="outline" type="button" onClick={() => setEditing(value => !value)}>{post.postUrl ? 'Update published post' : 'Add published post'}</Button></div>
    {editing ? <form onSubmit={publish} className="mt-4 grid gap-3"><label className="grid gap-1.5 text-sm">Published URL<input required name="postUrl" type="url" defaultValue={post.postUrl || ''} className={fieldClass} /></label><label className="grid gap-1.5 text-sm">Published caption<textarea required name="caption" maxLength={2200} defaultValue={post.caption || caption} className={fieldClass} /></label><label className="grid gap-1.5 text-sm">Posting time<input required name="postedAt" type="datetime-local" className={fieldClass} defaultValue={post.postedAt ? localDateTime(post.postedAt) : undefined} /></label><Button disabled={busy}>{busy ? 'Saving…' : 'Save published post'}</Button></form> : null}
  </article>
}

function localDateTime(value: string) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) }
