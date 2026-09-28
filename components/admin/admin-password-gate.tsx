import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { apiPost } from '@/lib/api/client'

export function AdminPasswordGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function unlock(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await apiPost('/api/admin/creator/session', { password })
      setPassword('')
      onUnlocked()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to unlock admin') }
    finally { setBusy(false) }
  }
  return <div className="mx-auto grid min-h-[60vh] max-w-md items-center">
    <form onSubmit={unlock} className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Private workspace</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Unlock admin</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-500">Use your separate admin password. Access locks automatically after eight hours.</p>
      <label className="mt-6 grid gap-2 text-sm font-medium">Admin password
        <input required type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="h-12 rounded-xl border border-zinc-300 px-3 focus:outline-none focus:ring-2 focus:ring-zinc-500" />
      </label>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      <Button disabled={busy} className="mt-5 h-12 w-full rounded-xl">{busy ? 'Verifying…' : 'Unlock workspace'}</Button>
    </form>
  </div>
}
