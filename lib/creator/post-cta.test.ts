import { expect, test } from 'bun:test'
import { captionContainsCreatorCode, creatorCaption, creatorCtaOverlay } from './post-guidance'

test('the generated caption carries its exact code without confusing similar handles', () => {
  expect(captionContainsCreatorCode(creatorCaption('p-123abc'), 'p-123abc')).toBe(true)
  expect(captionContainsCreatorCode('Use P-123ABC!', 'p-123abc')).toBe(true)
  expect(captionContainsCreatorCode('p-123abcdef', 'p-123abc')).toBe(false)
  expect(captionContainsCreatorCode('Use creatorXname', 'creator.name')).toBe(false)
  expect(captionContainsCreatorCode('Use creator.name', 'creator.name')).toBe(true)
})
test('CTA export keeps the exact reserved code and excludes markup', () => {
  expect(creatorCtaOverlay('p-123abc')).toContain('p-123abc</text>')
  expect(creatorCtaOverlay('<script>')).not.toContain('<script>')
})
