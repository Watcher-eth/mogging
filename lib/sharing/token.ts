import { randomBytes } from 'crypto'

export function createShareToken() {
  return randomBytes(18).toString('base64url')
}

