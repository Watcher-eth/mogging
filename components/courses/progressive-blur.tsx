import type { CSSProperties } from 'react'

// Adapted from Motion Primitives (MIT): bounded static layers, no per-layer Motion runtime.
// https://github.com/ibelick/motion-primitives/blob/main/components/core/progressive-blur.tsx
// Copyright (c) 2024 ibelick. License: docs/motion-primitives-license.md.
const angles = { bottom: 180, left: 270 } as const
const layerCount = 3

export function ProgressiveBlur({
  className = '',
  direction = 'bottom',
  intensity = 12,
}: {
  className?: string
  direction?: keyof typeof angles
  intensity?: number
}) {
  return (
    <div className={`c-progressive-blur ${className}`} aria-hidden="true">
      {Array.from({ length: layerCount }, (_, index) => {
        const stops = [index, index + 1, index + 2, index + 3].map(
          (stop, position) =>
            `${position === 1 || position === 2 ? '#000' : 'transparent'} ${(stop / (layerCount + 1)) * 100}%`,
        )
        const mask = `linear-gradient(${angles[direction]}deg, ${stops.join(', ')})`
        const filter = `blur(${(intensity * 2 ** index) / 4}px)`
        const style: CSSProperties = {
          maskImage: mask,
          WebkitMaskImage: mask,
          backdropFilter: filter,
          WebkitBackdropFilter: filter,
        }
        return <span key={index} style={style} />
      })}
    </div>
  )
}
