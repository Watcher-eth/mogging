import Link from 'next/link'
import { ArrowUpRight, LockKeyhole } from 'lucide-react'
import Image from 'next/image'
import { toast } from 'sonner'
import useSWRImmutable from 'swr/immutable'
import { apiGet } from '@/lib/api/client'
import { CreatorShell } from './creator-shell'
import type { CreatorDashboard } from './types'
import styles from './creator-studio.module.css'

type PostAccess = 'loading' | 'locked' | 'allowed'
type Creation = 'cta' | 'post' | 'scan'
const tools: Array<{ id: Creation; name: string; description: string; action: string; href: string }> = [
  { id: 'cta', name: 'CTA', description: 'Create an end card, overlay, or app preview.', action: 'Create a CTA', href: '/creator/cta-generator' },
  { id: 'post', name: 'Post', description: 'Turn a script into a video with voice and visuals.', action: 'Create a post', href: '/creator/video-studio' },
  { id: 'scan', name: 'Mock scan', description: 'Create a realistic face report with editable scores.', action: 'Create a mock scan', href: '/creator/cta-generator?mode=mock' },
]

function StudioPreviewStack({ kind }: { kind: Creation }) {
  return <div className={styles.illustration} aria-hidden="true">
    <div className={`${styles.stack} ${styles[kind]}`}>
      {(kind === 'scan' ? ['zendaya', 'marlon', 'tom-holland'] : kind === 'post' ? ['tom-holland', 'zendaya', 'marlon'] : ['marlon', 'tom-holland', 'zendaya']).map(person => <div key={person} className={`${styles.screen} ${kind !== 'post' ? styles.phone : ''}`}>
        <Image src={`/creator/studio-previews/${kind === 'scan' ? 'mock-scan' : kind}-${person}${kind === 'cta' ? '-report' : ''}.webp`} alt="" width={540} height={kind === 'scan' ? 1169 : 960} sizes="(max-width: 640px) 50px, 94px" />
      </div>)}
    </div>
  </div>
}

export function CreatorStudioChooser({ postAccess }: { postAccess: PostAccess }) {
  return <div className={styles.studio}>
    <header className={styles.header}><p className={styles.eyebrow}>Studio</p><h1>What do you want to create?</h1></header>
    <div className={styles.cards}>
      {tools.map(tool => {
        const locked = tool.id === 'post' && postAccess !== 'allowed'
        const content = <>
          <StudioPreviewStack kind={tool.id} />
          <div className={styles.body}><div className={styles.name}><h2>{tool.name}</h2>{tool.id === 'post' ? <span className={styles.new}>New</span> : null}</div><p>{tool.description}</p></div>
          <div className={styles.action}>{locked ? <><span>{postAccess === 'loading' ? 'Checking access…' : 'Selected creators only'}</span><LockKeyhole size={15} strokeWidth={1.6} /></> : <><span>{tool.action}</span><ArrowUpRight size={17} strokeWidth={1.6} /></>}</div>
        </>
        return locked ? <button key={tool.id} type="button" disabled={postAccess === 'loading'} onClick={() => toast('Coming soon', { id: 'creator-post-coming-soon', description: 'Post is currently available to early access creators.', icon: <LockKeyhole size={18} strokeWidth={1.6} /> })} className={`${styles.card} ${styles.locked}`} aria-label={`${tool.name} — ${postAccess === 'loading' ? 'checking access' : 'locked, available to selected creators'}`}>{content}</button> : <Link key={tool.id} href={tool.href} className={styles.card}>{content}</Link>
      })}
    </div>
  </div>
}

export default function CreatorStudio() {
  const { data, isLoading } = useSWRImmutable<CreatorDashboard>('/api/creator', apiGet)
  const postAccess: PostAccess = isLoading ? 'loading' : data?.profile?.videoStudioAccess && data.profile.authStatus !== 'suspended' ? 'allowed' : 'locked'
  return <CreatorShell><CreatorStudioChooser postAccess={postAccess} /></CreatorShell>
}
