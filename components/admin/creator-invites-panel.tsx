import { useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiGet, apiPost, apiRequest } from '@/lib/api/client'

type Invite = { id: string; displayName: string; handle: string; expiresAt: string; claimedAt: string | null; revokedAt: string | null }
type Created = { id: string; path: string; avatarFound: boolean; expiresAt: string }

export function CreatorInvitesPanel() {
  const { data, error, mutate } = useSWR<{ invites: Invite[] }>('/api/admin/creator/invites', apiGet)
  const [created, setCreated] = useState<Created | null>(null)
  const [saving, setSaving] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    setSaving(true)
    setMessage('')
    setCreated(null)
    try {
      const result = await apiPost<Created>('/api/admin/creator/invites', {
        displayName: fields.get('displayName'), handle: fields.get('handle'), profileUrl: fields.get('profileUrl'),
        avatarUrl: fields.get('avatarUrl'), evidenceUrl: fields.get('evidenceUrl'), verificationConfirmed: fields.get('verified') === 'on',
      })
      setCreated(result)
      form.reset()
      await mutate()
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Could not create invite') }
    finally { setSaving(false) }
  }

  async function revoke(id: string) {
    setRevoking(id)
    try {
      await apiRequest('/api/admin/creator/invites', { method: 'DELETE', body: JSON.stringify({ id }) })
      if (created?.id === id) setCreated(null)
      await mutate()
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not revoke invite') }
    finally { setRevoking(null) }
  }

  const url = created && typeof window !== 'undefined' ? `${window.location.origin}${created.path}` : ''
  return <section className="max-w-4xl">
    <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">Prepare a creator’s verified TikTok account from your Discord conversation. They claim it with their preferred login and choose a payout method to finish setup.</p>
    <form onSubmit={(event) => void create(event)} className="mt-6 grid gap-4 sm:grid-cols-2">
      {[
        { name: 'displayName', label: 'Creator name', placeholder: 'Creator name', required: true, max: 80 },
        { name: 'handle', label: 'TikTok handle', placeholder: '@creator', required: true, max: 33 },
        { name: 'profileUrl', label: 'TikTok profile URL', placeholder: 'https://www.tiktok.com/@creator', required: true, max: 2048 },
        { name: 'avatarUrl', label: 'Profile-photo URL (optional)', placeholder: 'TikTok CDN URL; otherwise fetched automatically', required: false, max: 2048 },
        { name: 'evidenceUrl', label: 'Reviewed Discord analytics message or recording', placeholder: 'https://discord.com/channels/…/…/…', required: true, max: 2048 },
      ].map((field) => <label key={field.name} className="grid gap-2 text-sm"><span className="font-medium">{field.label}</span><input name={field.name} type={field.name.endsWith('Url') ? 'url' : 'text'} required={field.required} maxLength={field.max} placeholder={field.placeholder} className="creator-field w-full" /></label>)}
      <label className="flex items-start gap-3 text-sm leading-6 sm:col-span-2"><input name="verified" type="checkbox" required className="mt-1 size-4 accent-[#00A8EF]" /><span>I verified ownership of this TikTok account and reviewed its audience analytics for the past 28 days in Discord.</span></label>
      {message ? <p role="alert" className="text-sm text-red-600 sm:col-span-2">{message}</p> : null}
      <Button disabled={saving} className="h-11 rounded-full sm:col-span-2 sm:justify-self-start" type="submit">{saving ? <Loader2 className="animate-spin" /> : null}Create personalized invite</Button>
    </form>
    {created ? <div className="mt-6 rounded-2xl bg-zinc-50 p-5">
      <p className="text-sm font-medium">Your invite is ready</p>
      <p className="mt-2 text-xs leading-5 text-zinc-500">Copy this link now; it is shown only once. Send it privately to the verified creator. It can be claimed once and expires in 30 days.</p>
      {!created.avatarFound ? <p className="mt-2 text-xs text-amber-700">TikTok did not return a profile photo. The card uses their initial. Revoke and recreate with a TikTok CDN photo URL to include their photo.</p> : null}
      <input aria-label="Creator invite link" readOnly value={url} className="creator-field mt-3 w-full text-xs" onFocus={(event) => event.currentTarget.select()} />
      <div className="mt-3 flex gap-3"><Button type="button" variant="outline" className="rounded-full" onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success('Invite link copied')).catch(() => toast.error('Select the link above and copy it manually'))}>Copy link</Button><Button asChild variant="outline" className="rounded-full"><a href={created.path} target="_blank" rel="noreferrer">Preview invitation</a></Button></div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/og/creator-invite?token=${created.path.split('/').pop()}`} alt="Personalized creator link preview" width={1200} height={630} className="mt-5 w-full max-w-2xl rounded-2xl border border-zinc-200" />
    </div> : null}
    <div className="mt-8 border-t border-zinc-100 pt-5"><h3 className="text-sm font-medium">Recent invitations</h3>
      {error ? <p role="alert" className="mt-3 text-sm text-red-600">Could not load invitations. <button className="underline" onClick={() => void mutate()}>Try again</button></p> : !data ? <Loader2 aria-label="Loading invitations" className="mt-4 size-5 animate-spin" /> : !data.invites.length ? <p className="mt-3 text-sm text-zinc-500">No invitations yet.</p> : <ul className="mt-3 divide-y divide-zinc-100">{data.invites.map((invite) => {
        const status = invite.claimedAt ? 'Claimed' : invite.revokedAt ? 'Revoked' : new Date(invite.expiresAt) <= new Date() ? 'Expired' : 'Ready'
        return <li key={invite.id} className="flex items-center justify-between gap-3 py-4"><div><p className="text-sm font-medium">{invite.displayName} <span className="font-normal text-zinc-500">@{invite.handle}</span></p><p className="mt-1 text-xs text-zinc-500">{status} · Expires {new Date(invite.expiresAt).toLocaleDateString()}</p></div>{status === 'Ready' ? <Button variant="outline" className="rounded-full" disabled={revoking !== null} onClick={() => void revoke(invite.id)}>{revoking === invite.id ? <Loader2 className="animate-spin" /> : null}Revoke</Button> : null}</li>
      })}</ul>}
    </div>
  </section>
}
