import { expect, test } from 'bun:test'
import sharp from 'sharp'
import { normalizePaymentReceipt } from './payment-receipt'

test('receipt images are normalized to bounded JPEG data', async () => {
  const input = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: 'white' } }).png().toBuffer()
  const receipt = await normalizePaymentReceipt(`data:image/png;base64,${input.toString('base64')}`)
  const output = Buffer.from(receipt!, 'base64')
  const metadata = await sharp(output).metadata()
  expect(metadata.format).toBe('jpeg')
  expect(metadata.width).toBe(1600)
  expect(metadata.height).toBe(800)
  expect(output.length).toBeLessThan(1024 * 1024)
})

test('invalid and oversized receipts cannot be stored', async () => {
  expect(await normalizePaymentReceipt()).toBeNull()
  await expect(normalizePaymentReceipt('https://example.com/receipt.png')).rejects.toThrow()
  await expect(normalizePaymentReceipt('data:image/png;base64,aGVsbG8=')).rejects.toThrow()
  await expect(normalizePaymentReceipt(`data:image/jpeg;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')}`)).rejects.toThrow('under 5 MB')
})
