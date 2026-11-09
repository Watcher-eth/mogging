import { ArrowLeft, ArrowUpRight, ChevronRight, Download, ScanFace, Link2, LogOut, Settings, Shield, UserPlus, UserRound } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { signOut } from 'next-auth/react'
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { TextMorph } from 'torph/react'
import { GoalBranch } from '@/components/core/goal-branch'
import { AnimatedDialogPanel } from '@/components/ui/animated-dialog-panel'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { apiGet, apiPatch } from '@/lib/api/client'
import type { MemberProfile } from '@/lib/users/member-pages'
import styles from './member-account-menu.module.css'

const actions = [
  { id: 'settings', label: 'Settings', Icon: Settings, description: 'Manage your visibility and download your data.' },
  { id: 'scans', label: 'Get more Scans', Icon: ScanFace },
  { id: 'invite', label: 'Invite', Icon: UserPlus, description: 'Share your personal invite link with friends.' },
  { id: 'privacy', label: 'Privacy', Icon: Shield, description: 'See what’s shared and what stays private.' },
  { id: 'logout', label: 'Log out', Icon: LogOut, description: 'Log out of Mogging on this browser?' },
] as const
type Action = typeof actions[number]['id']
export type AccountPanel = Exclude<Action, 'scans'> | 'account' | 'scan-invite'
const settingsPath = '/api/user/member-settings'
const ease = [.22, 1, .36, 1] as const

export function MemberAccountMenu({ profile, preview, panel, onPanel, onScans, mobile }: { profile?: MemberProfile; preview: boolean; panel: AccountPanel | null; onPanel: (panel: AccountPanel | null) => void; onScans: () => void; mobile?: boolean }) {
  const [menu, setMenu] = useState<'hover' | 'click' | null>(null)
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const avatar = useRef<HTMLImageElement>(null)
  const menuId = useId()
  const reduced = useReducedMotion()
  const src = profile?.imageUrl
  const score = profile?.score?.toFixed(1) ?? '—'

  useEffect(() => {
    const image = avatar.current
    if (src && image?.complete && image.naturalWidth === 0) setFailedImage(src)
  }, [src])

  useEffect(() => {
    if (!menu) return
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setMenu(null)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [menu])

  function openPanel(action: Action) {
    setMenu(null)
    if (action === 'scans') onScans()
    else onPanel(action)
  }

  return <>
    {!mobile && <div className={styles.anchor} ref={wrapper}
      onPointerEnter={event => { if (event.pointerType === 'mouse' && !panel) setMenu(current => current ?? 'hover') }}
      onPointerLeave={event => { if (event.pointerType === 'mouse') setMenu(current => current === 'hover' ? null : current) }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(null) }}
      onKeyDown={event => {
        if (event.key === 'Escape' && menu) {
          event.stopPropagation()
          setMenu(null)
          trigger.current?.focus()
        }
      }}>
      <button ref={trigger} type="button" className={styles.trigger} aria-expanded={Boolean(menu)} aria-controls={menu ? menuId : undefined}
        aria-label={profile?.score == null ? 'Profile menu' : `Profile menu, overall score ${score} out of 10`}
        onClick={() => setMenu(current => current === 'click' ? null : 'click')}>
        <GoalBranch />
        <strong aria-hidden="true"><Morph>{score}</Morph></strong>
        <span className={styles.avatar}>
          {src && src !== failedImage ? <img ref={avatar} src={src} width={36} height={36} alt="" onError={() => setFailedImage(src)} /> : <UserRound size={17} aria-hidden="true" />}
        </span>
        <GoalBranch />
      </button>
      <AnimatePresence>
        {menu && <motion.div className={styles.dropdownBridge} id={menuId} key="account-menu"
          initial={reduced ? false : { opacity: 0, scale: .94, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: reduced ? 1 : .98, y: reduced ? 0 : -3 }}
          transition={{ duration: reduced ? 0 : .22, ease }}>
          <div className={styles.glass}><ActionList onSelect={openPanel} /></div>
        </motion.div>}
      </AnimatePresence>
    </div>}
    <AccountDialog panel={panel} onPanel={onPanel} preview={preview} onCloseFocus={() => trigger.current?.focus()} onScans={onScans} restoreFocus={!mobile} />
  </>
}

function Morph({ children }: { children: string }) {
  return useReducedMotion() ? children : <TextMorph duration={240}>{children}</TextMorph>
}

function ActionList({ onSelect }: { onSelect: (action: Action) => void }) {
  return <div className={styles.actions}>{actions.map(({ id, label, Icon }) =>
    <button key={id} type="button" data-destructive={id === 'logout' || undefined} onClick={() => onSelect(id)}>
      <span>{label}</span><Icon size={17} strokeWidth={1.7} aria-hidden="true" />
    </button>
  )}</div>
}

function AccountDialog({ panel, onPanel, preview, onCloseFocus, onScans, restoreFocus }: {
  panel: AccountPanel | null; onPanel: (panel: AccountPanel | null) => void; preview: boolean; onCloseFocus: () => void; onScans: () => void; restoreFocus: boolean
}) {
  const meta = actions.find(item => item.id === panel)
  const scanInvite = panel === 'scan-invite'
  const title = scanInvite ? 'Invite 3 friends. Get a free scan.' : meta?.label ?? 'Account'
  return <Dialog open={panel !== null} onOpenChange={open => { if (!open) onPanel(null) }}>
    <DialogContent className={styles.dialog} overlayClassName={styles.overlay} onCloseAutoFocus={event => { if (restoreFocus) { event.preventDefault(); onCloseFocus() } }}>
      <AnimatedDialogPanel contentKey={panel ?? 'account'} className={styles.panelFrame}>
        <div className={styles.panel}>
          <div className={styles.heading}>
            {meta && <button type="button" className={styles.back} onClick={() => onPanel('account')}><ArrowLeft size={14} /> Account</button>}
            <DialogTitle className={styles.title}>{title}</DialogTitle>
            <DialogDescription className={styles.description}>{scanInvite ? 'Share your invite link. Earn a scan when three friends join.' : meta && 'description' in meta ? meta.description : 'Choose what you’d like to manage.'}</DialogDescription>
          </div>
          {panel === 'settings' && <SettingsPanel preview={preview} />}
          {(panel === 'invite' || scanInvite) && <InvitePanel preview={preview} scan={scanInvite} />}
          {panel === 'privacy' && <PrivacyPanel onSettings={() => onPanel('settings')} />}
          {panel === 'logout' && <LogoutPanel preview={preview} onCancel={() => onPanel('account')} onClose={() => onPanel(null)} />}
          {panel === 'account' && <ActionList onSelect={action => { if (action === 'scans') { onPanel(null); onScans() } else onPanel(action) }} />}
        </div>
      </AnimatedDialogPanel>
    </DialogContent>
  </Dialog>
}

type Visibility = { isPublic: boolean }
function SettingsPanel({ preview }: { preview: boolean }) {
  const { data, error, mutate, isLoading } = useSWR<Visibility>(preview ? null : settingsPath, apiGet)
  const { mutate: invalidate } = useSWRConfig()
  const [demoPublic, setDemoPublic] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState(false)
  const [message, setMessage] = useState('')
  const isPublic = preview ? demoPublic : data?.isPublic ?? false

  async function toggle() {
    setMessage('')
    if (preview) { setDemoPublic(!isPublic); return }
    setSaving(true)
    try {
      await mutate(apiPatch<Visibility>(settingsPath, { isPublic: !isPublic }), {
        optimisticData: { isPublic: !isPublic }, rollbackOnError: true, revalidate: false,
      })
      void invalidate(key => typeof key === 'string' && key.startsWith('/api/leaderboard/members?'))
    } catch { setMessage('Couldn’t update visibility. Try again.') }
    finally { setSaving(false) }
  }

  async function download() {
    setMessage('')
    setExporting(true)
    try {
      const response = preview ? new Response(JSON.stringify({ preview: true }, null, 2), { headers: { 'Content-Type': 'application/json' } })
        : await fetch('/api/user/export', { cache: 'no-store' })
      if (!response.ok) throw new Error('Export failed')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = 'mogging-data.json'
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setExported(true)
    } catch { setMessage('Couldn’t export your data. Try again.') }
    finally { setExporting(false) }
  }

  return <>
    <div className={styles.settingRow}>
      <div><b id="public-listing-label">Public leaderboard listing</b><p id="public-listing-note">Share your display name and score. Your evaluation photos and reports stay private.</p></div>
      <button type="button" role="switch" className={styles.switch} aria-labelledby="public-listing-label" aria-describedby="public-listing-note" aria-checked={isPublic}
        disabled={saving || (!preview && (!data || isLoading))} onClick={() => void toggle()}><span /></button>
    </div>
    {error && <p className={styles.error} role="alert">Couldn’t load visibility. <button type="button" onClick={() => void mutate()}>Retry</button></p>}
    <button type="button" className={styles.secondary} disabled={exporting} onClick={() => void download()}><Download size={16} /><Morph>{exporting ? 'Preparing export…' : exported ? 'Export again' : 'Export my data'}</Morph></button>
    {message && <p className={styles.error} role="alert">{message}</p>}
  </>
}

function InvitePanel({ preview, scan }: { preview: boolean; scan: boolean }) {
  const { data, error, mutate } = useSWR<{ url: string; reward?: { completed: number; required: number; available: boolean; granted: boolean } }>(preview ? null : '/api/referrals', apiGet, { shouldRetryOnError: false })
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const url = preview ? 'https://www.mogging.com/app' : data?.url
  async function copy() {
    if (!url) return
    try { await navigator.clipboard.writeText(url); setStatus('copied') }
    catch { setStatus('failed') }
  }
  return <>
    <div className={styles.inviteLink}><Link2 size={17} /><span>{url ?? (error ? 'Invite link unavailable' : 'Getting your invite link…')}</span></div>
    <button type="button" className={styles.primary} disabled={!url && !error} onClick={() => { if (error) void mutate(); else void copy() }}><Morph>{error ? 'Try again' : status === 'copied' ? 'Link copied' : 'Copy invite link'}</Morph></button>
    {scan && data?.reward && <p className={styles.privacyCopy}>{data.reward.available ? 'Your free scan is ready.' : data.reward.granted ? 'You’ve already used your free scan.' : `${data.reward.completed} of ${data.reward.required} friends joined`}</p>}
    {status === 'failed' && <p className={styles.error} role="alert">Copy the link directly from the field above.</p>}
  </>
}

function PrivacyPanel({ onSettings }: { onSettings: () => void }) {
  return <>
    <p className={styles.privacyCopy}>Your evaluation photos, reports, and face landmarks stay private. If you enable a public listing, anyone can see your display name and score on the leaderboard.</p>
    <button type="button" className={styles.secondary} onClick={onSettings}><Settings size={16} /> Visibility settings <ChevronRight size={15} /></button>
    <Link href="/privacy" target="_blank" rel="noopener noreferrer" className={styles.secondary}><Shield size={16} /> Privacy policy <ArrowUpRight size={15} /></Link>
  </>
}

function LogoutPanel({ preview, onCancel, onClose }: { preview: boolean; onCancel: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  async function logout() {
    if (preview) { onClose(); return }
    setBusy(true)
    setFailed(false)
    try { await signOut({ callbackUrl: '/app/home' }) }
    catch { setFailed(true); setBusy(false) }
  }
  return <>
    <div className={styles.footer}>
      <button type="button" className={styles.secondary} onClick={onCancel}>Cancel</button>
      <button type="button" className={styles.danger} disabled={busy} onClick={() => void logout()}><Morph>{busy ? 'Logging out…' : 'Log out'}</Morph></button>
    </div>
    {failed && <p className={styles.error} role="alert">Couldn’t log out. Try again.</p>}
  </>
}
