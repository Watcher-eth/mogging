import dynamic from 'next/dynamic'
import { useMemo } from 'react'
import { useRouter } from 'next/router'
import { CreatorHeader } from '@/components/creator/creator-shell'
import { previewLandmarks } from '@/components/landing/overlay'
import { buildAnalysisPost, type AnalysisPostInput } from '@/lib/creator/analysis-post'
import type { GeneratorImage } from '@/lib/creator/content-generator'

const VideoStudio = dynamic(() => import('@/components/creator/video-studio'), { ssr: false })
const sampleInput: AnalysisPostInput = { formatId: 'score-reveal', subject: 'Sample face', hook: 'What makes this face stand out?', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eye area', strongestScore: '8.1', opportunityFeature: 'Jaw definition', opportunityScore: '6.2', recommendation: 'Keep your grooming routine consistent. Review your daily Protocol tasks each morning.', productFeatures: ['Category scores', 'Personalized protocol', 'Progress tracking'], cta: 'Find your strengths. Build your plan.' }
const sampleImages: GeneratorImage[] = [{ id: 'bundled-sample', name: 'Bundled sample face', dataUrl: '/model2.png', width: 1024, height: 1536, status: 'ready', landmarks: previewLandmarks as GeneratorImage['landmarks'] }]

export default function MotionPreview() {
  const router = useRouter()
  const plan = useMemo(() => buildAnalysisPost(sampleInput), [])
  return <main className="creator-portal min-h-screen bg-white px-4 py-8 sm:px-8"><div className="mx-auto max-w-[1440px]"><CreatorHeader eyebrow="Creator Tools · Local Preview" title="CTA Studio" description="Interactive motion engine using bundled sample imagery and editable demo report values." /><VideoStudio input={sampleInput} plan={plan} images={sampleImages} onBack={() => void router.push('/creator/cta-generator')} /></div></main>
}

export function getServerSideProps() {
  return process.env.NODE_ENV === 'development' ? { props: {} } : { notFound: true }
}
