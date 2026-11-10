import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProgressiveBlur } from './progressive-blur'

test('directional portrait blur uses bounded Motion Primitives gradient layers', () => {
  for (const [direction, angle] of [['left', 270], ['right', 90], ['bottom', 180], ['top', 0]] as const) {
    const markup = renderToStaticMarkup(<ProgressiveBlur direction={direction} blurLayers={8} intensity={16} />)
    expect(markup.match(/<span/g)).toHaveLength(8)
    expect(markup).toContain(`linear-gradient(${angle}deg`)
    expect(markup).toContain('blur(16px)')
    expect(markup).toContain('-webkit-backdrop-filter')
    expect(markup).not.toContain('blur(32px)')
  }
})

test('course defaults retain the original three layers and portrait layers stay capped', () => {
  const course = renderToStaticMarkup(<ProgressiveBlur />)
  expect(course.match(/<span/g)).toHaveLength(3)
  for (const intensity of [3, 6, 12]) expect(course).toContain(`blur(${intensity}px)`)
  expect(renderToStaticMarkup(<ProgressiveBlur blurLayers={99} />).match(/<span/g)).toHaveLength(8)
})
