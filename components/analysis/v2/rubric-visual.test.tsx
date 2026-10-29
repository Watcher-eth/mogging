import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { RubricVisual } from './rubric-visual'

test('chart cursors wait for viewport entry without shifting the final scale', () => {
  const markup = renderToStaticMarkup(<RubricVisual kind="Orbit" positions={[.62]} grade={null} label="Jaw definition" value="6.2 / 10" scale="quality" />)
  expect(markup).toContain('data-chart-state="waiting"')
  expect(markup).toContain('opacity="0"')
  expect(markup).not.toContain('transform-origin')
  expect(markup).toContain('viewBox="-12 -12 900')
  expect(markup).not.toContain('NaN')
  expect(markup).not.toContain('animation:')
})

test('missing and nonfinite measurements never acquire animated cursors', () => {
  for (const props of [{ kind: 'Rail', positions: [], grade: null }, { kind: 'Orbit', positions: [NaN, Infinity], grade: null }]) {
    expect(renderToStaticMarkup(<RubricVisual {...props} />)).toBe('')
  }
})

test('paired ranges retain two independent cursor marks and the saved label', () => {
  const markup = renderToStaticMarkup(<RubricVisual kind="Capsule" positions={[.4, .6]} grade={null} label="Eye spacing" value="L 0.40× · R 0.60×" />)
  expect(markup.match(/<circle/g)).toHaveLength(2)
  expect(markup).toContain('L 0.40× · R 0.60×')
})
