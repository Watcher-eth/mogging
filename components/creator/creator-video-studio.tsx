import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useMemo } from 'react'
import { previewLandmarks } from '@/components/landing/overlay'
import { buildAnalysisPost, type AnalysisPostInput } from '@/lib/creator/analysis-post'
import type { GeneratorImage } from '@/lib/creator/content-generator'

const VideoStudio = dynamic(() => import('./video-studio'), { ssr: false })
const sampleInput: AnalysisPostInput = { formatId: 'score-reveal', subject: 'Sample face', hook: 'What makes this face stand out?', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eye area', strongestScore: '8.1', opportunityFeature: 'Jaw definition', opportunityScore: '6.2', recommendation: 'Keep your grooming routine consistent. Review your daily Protocol tasks each morning.', productFeatures: ['Category scores', 'Personalized protocol', 'Progress tracking'], cta: 'Find your strengths. Build your plan.' }
const sampleImages: GeneratorImage[] = [{ id: 'bundled-sample', name: 'Bundled sample face', dataUrl: '/model2.png', width: 1024, height: 1536, status: 'ready', landmarks: previewLandmarks as GeneratorImage['landmarks'] }]

export default function CreatorVideoStudio({ trackExports = false, previewSubmission = false }: { trackExports?: boolean; previewSubmission?: boolean }) {
  const plan = useMemo(() => buildAnalysisPost(sampleInput), [])
  return <main className="creator-portal min-h-screen bg-white px-4 py-8 sm:px-8"><div className="mx-auto max-w-[1440px]">{trackExports ? <Link href="/creator/studio" className="mb-4 inline-flex min-h-11 items-center gap-2 text-xs text-zinc-500 hover:text-zinc-950"><ArrowLeft className="size-3.5" />Studio</Link> : null}<VideoStudio trackExports={trackExports} previewSubmission={previewSubmission} input={sampleInput} plan={plan} images={sampleImages} /></div></main>
}

