import { CREATOR_INVITE_PROGRESS, type CreatorInvitePreview } from '@/lib/creator/invite-validation'

export function CreatorInviteOgCard({ invite, avatar, background }: { invite: CreatorInvitePreview; avatar: string | null; background: string }) {
  const ready = invite.state === 'ready'
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: 'white', color: '#181a1d', fontFamily: 'Geist', position: 'relative' }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={background} alt="" width={1200} height={630} style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover', objectPosition: 'center', opacity: 0.55 }} />
    <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(to bottom, rgba(255,255,255,0) 45%, #ffffff 100%)' }} />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 172, height: 172, border: '6px solid white', borderRadius: 86, overflow: 'hidden', background: '#f2f3f4', fontSize: 64 }}>
      {/* ImageResponse needs native image elements. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {avatar ? <img src={avatar} alt="" width={160} height={160} style={{ borderRadius: 80, objectFit: 'cover' }} /> : invite.displayName.slice(0, 1).toUpperCase()}
    </div>
    <span style={{ fontSize: 28, marginTop: 20 }}>@{invite.handle}</span>
    <span style={{ fontSize: 56, letterSpacing: '-2px', marginTop: 22 }}>{ready ? 'Finish Setup' : invite.state === 'claimed' ? 'Account claimed' : 'Invitation expired'}</span>
    {ready ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 500, marginTop: 28 }}>
      <div style={{ display: 'flex', width: '100%', height: 18, borderRadius: 9, background: '#e8ebee', overflow: 'hidden' }}><div style={{ display: 'flex', width: `${CREATOR_INVITE_PROGRESS}%`, borderRadius: 9, background: '#00A8EF' }} /></div>
      <span style={{ fontSize: 30, color: '#00A8EF', marginTop: 14 }}>{CREATOR_INVITE_PROGRESS}% complete</span>
    </div> : null}
  </div>
}
