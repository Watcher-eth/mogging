import { expect, test } from 'bun:test'
import { captionContainsCreatorCode } from './post-guidance'

test('legacy post codes require an exact caption match', () => {
  expect(captionContainsCreatorCode('Use P-123ABC!', 'p-123abc')).toBe(true)
  expect(captionContainsCreatorCode('p-123abcdef', 'p-123abc')).toBe(false)
  expect(captionContainsCreatorCode('Use creatorXname', 'creator.name')).toBe(false)
  expect(captionContainsCreatorCode('Use creator.name', 'creator.name')).toBe(true)
})
