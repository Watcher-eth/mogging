import { useMemo, useRef, useState } from 'react'
import { ContentSlidePreview } from '@/components/creator/content-slide'
import { reportCategories, buildMockOverallCategory } from '@/lib/creator/mock-report-data'
import { mockReportScrollMax, mockReportSize } from '@/lib/creator/mock-report'
import type { ContentSlide, GeneratorImage } from '@/lib/creator/content-generator'
import { previewLandmarks } from './overlay'

const images: GeneratorImage[] = [{
  id: 'example-portrait', name: 'Example portrait', dataUrl: '/model2.png', width: 1024, height: 1536,
  landmarks: { ...previewLandmarks, source: 'mediapipe-face-landmarker' }, status: 'ready',
}]
const categories = [...reportCategories].sort((a, b) => a.id === 'overall' ? -1 : b.id === 'overall' ? 1 : 0)

// The homepage and creator exports share one report painter.
export function ReportPreview({ active }: { active: boolean }) {
  const [categoryId, setCategoryId] = useState('overall')
  const [scroll, setScroll] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const category = useMemo(() => categoryId === 'overall'
    ? buildMockOverallCategory('7.2', {})
    : reportCategories.find(item => item.id === categoryId)!, [categoryId])
  const maximum = mockReportScrollMax(category)
  const slide = useMemo<ContentSlide>(() => ({
    id: 'homepage-report', templateId: 'mock-report', imageId: images[0].id, categoryId,
    currentScore: '7.2', potentialScore: '8.5', categoryScores: [], mockReport: { category, scroll },
    eyebrow: '', headline: '', supportingCopy: '', metricLabel: category.title, metricValue: String(category.score), cta: '',
  }), [category, categoryId, scroll])

  function selectCategory(value: string) {
    setCategoryId(value)
    if (scroller.current) scroller.current.scrollTop = 0
    setScroll(0)
  }

  return <div ref={scroller} className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none]" onScroll={event => setScroll(event.currentTarget.scrollTop)}>
    <div style={{ height: mockReportSize.height + maximum }}>
      <div className="sticky top-0 h-[844px]">
        <ContentSlidePreview slide={slide} images={images} format={mockReportSize} active={active} />
        <select aria-label="Preview report category" value={categoryId} onChange={event => selectCategory(event.target.value)}
          className="absolute left-[18px] top-[61px] h-[38px] max-w-[210px] cursor-pointer rounded-full border-0 bg-transparent opacity-0 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2">
          {categories.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </div>
    </div>
  </div>
}
