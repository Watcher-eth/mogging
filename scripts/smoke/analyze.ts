const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const imageData = process.env.SMOKE_IMAGE_DATA_URL

if (!imageData) {
  console.error('Set SMOKE_IMAGE_DATA_URL to a real face image data URL before running this smoke test.')
  process.exit(1)
}

const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/analyze`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    imageData,
    gender: process.env.SMOKE_GENDER || 'other',
    photoType: 'face',
    name: 'Smoke analysis',
  }),
})

const body = await response.json()
console.log(JSON.stringify({ status: response.status, body }, null, 2))

if (!response.ok) {
  process.exit(1)
}

export {}
