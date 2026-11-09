import { ProgressiveBlur } from '@/components/courses/progressive-blur'

const edges = ['top', 'right', 'bottom', 'left'] as const

export function PhotoEdgeFade() {
  return edges.map(edge => <div key={edge} className="desktop-capture-fade" data-edge={edge} aria-hidden="true">
    <ProgressiveBlur direction={edge} blurLayers={3} intensity={3.5} />
    <span className="desktop-photo-wash" />
  </div>)
}
