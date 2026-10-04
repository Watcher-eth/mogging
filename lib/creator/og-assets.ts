import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const creatorOgFont = readFile(join(process.cwd(), 'public/fonts/Geist-Regular.ttf'))
export const creatorOgBackground = readFile(join(process.cwd(), 'public/creator-invite-background.png'))
  .then((data) => `data:image/png;base64,${data.toString('base64')}`)
