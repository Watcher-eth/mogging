import { expect, test } from 'bun:test'
import type { NextApiRequest, NextApiResponse } from 'next'
import handler from '../../pages/api/experimental/analysis-v2/landmarks'
import sampleHandler from '../../pages/api/experimental/analysis-v2/sample-report'

test('production cannot access either v2 endpoint, even with malformed input', async () => {
  const previous = process.env.NODE_ENV
  let status = 0
  let ended = false
  const response = { status(value: number) { status = value; return this }, end() { ended = true } } as unknown as NextApiResponse
  try {
    Object.assign(process.env, { NODE_ENV: 'production' })
    for (const route of [handler, sampleHandler]) {
      status = 0; ended = false
      await route({ method: 'POST', body: null } as NextApiRequest, response)
      expect(status).toBe(404)
      expect(ended).toBe(true)
    }
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV')
    else Object.assign(process.env, { NODE_ENV: previous })
  }
})
