import { describe, expect, test } from 'bun:test'
import { ImageResponse } from '@vercel/og'
import sharp from 'sharp'
import { parseStoryDesign, prepareStoryPortrait, ReportStoryDesign } from './story-design'

describe('report story designs', () => {
  test('old clients and unknown design values keep the original card', () => {
    for (const value of [undefined, null, '', 'original', 'unknown', ['precision']]) expect(parseStoryDesign(value)).toBe('original')
    expect(parseStoryDesign('precision')).toBe('precision')
    expect(parseStoryDesign('afterimage')).toBe('afterimage')
  })
  test('both new designs export real 1080 × 1920 PNGs with distinct portrait treatments', async () => {
    const sourceBytes = await sharp({ create: { width: 100, height: 150, channels: 3, background: '#a98670' } }).png().toBuffer()
    const source = `data:image/png;base64,${sourceBytes.toString('base64')}`
    const portraits = []
    for (const design of ['precision', 'afterimage'] as const) {
      const portrait = await prepareStoryPortrait(source, design)
      portraits.push(portrait)
      const image = new ImageResponse(<ReportStoryDesign design={design} portrait={portrait} landmarks={null} score="10.0" potential="10.0" rank="True Adam" />, { width: 1080, height: 1920 })
      const bytes = Buffer.from(await image.arrayBuffer())
      const metadata = await sharp(bytes).metadata()
      expect(metadata.format).toBe('png')
      expect(metadata.width).toBe(1080)
      expect(metadata.height).toBe(1920)
    }
    expect(portraits[0]).not.toBe(portraits[1])
  })
  test('a missing portrait fails rather than substituting somebody else’s face', async () => {
    await expect(prepareStoryPortrait('data:text/plain,not-an-image', 'precision')).rejects.toThrow()
  })
})
