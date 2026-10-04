import { campaignTimeLabel, type CampaignPreview } from '@/lib/creator/campaign-preview'
import { sprintMoney } from '@/lib/creator/sprints'

export function CampaignOgCard({ campaign, background, now }: { campaign: CampaignPreview; background: string; now?: number }) {
  const fontSize = campaign.name.length > 80 ? 54 : campaign.name.length > 45 ? 66 : 82
  const budget = sprintMoney(campaign.budgetCents)
  const timeline = campaignTimeLabel(campaign, now)
  return <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: 'white', color: '#181a1d', fontFamily: 'Geist', position: 'relative', padding: '48px 64px' }}>
    {/* ImageResponse requires a native image element. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={background} alt="" width={1200} height={630} style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover', opacity: 0.55 }} />
    <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(to bottom, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.85) 45%, #ffffff 70%)' }} />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 25 }}>
      <span style={{ letterSpacing: '-1px' }}>Mogging.com/creator</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#00A8EF', background: '#eef9ff', borderRadius: 30, padding: '12px 22px', fontSize: 21 }}>
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#00A8EF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" />
          <path d="m20 2 .7 2.3L23 5l-2.3.7L20 8l-.7-2.3L17 5l2.3-.7L20 2ZM4 17l.7 2.3L7 20l-2.3.7L4 23l-.7-2.3L1 20l2.3-.7L4 17Z" />
        </svg>
        <span>New</span>
      </div>
    </div>
    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '20px 0' }}>
      <span style={{ fontSize, letterSpacing: '-3px', lineHeight: 1.08, wordBreak: 'break-word' }}>{campaign.name}</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 32, borderTop: '1px solid #e8ebee', paddingTop: 30 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 503, gap: 10 }}>
        <span style={{ fontSize: 26, color: '#34383e' }}>Campaign budget</span>
        <span style={{ display: 'flex', alignItems: 'center', height: 140, fontSize: budget.length > 8 ? 88 : budget.length > 6 ? 104 : 120, letterSpacing: '-4px', color: '#00A8EF' }}>{budget}</span>
      </div>
      <div style={{ display: 'flex', width: 1, height: 110, background: '#e8ebee' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 503, gap: 10 }}>
        <span style={{ fontSize: 26, color: '#34383e' }}>Timeline</span>
        <span style={{ display: 'flex', alignItems: 'center', height: 140, fontSize: timeline.length > 12 ? 64 : 96, letterSpacing: '-3px' }}>{timeline}</span>
      </div>
    </div>
  </div>
}
