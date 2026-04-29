import { createHash } from 'crypto'

export function getBase64Payload(imageData: string) {
  const commaIndex = imageData.indexOf(',')
  return commaIndex >= 0 ? imageData.slice(commaIndex + 1) : imageData
}

export function computeImageHash(imageData: string) {
  return createHash('sha256').update(getBase64Payload(imageData)).digest('hex')
}

