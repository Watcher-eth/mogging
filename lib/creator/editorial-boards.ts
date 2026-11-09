import { drawEditorialPortrait, editorialCoverPose, mixEditorialPose, type EditorialPortraitPose } from './editorial-layout'
import { editorialEase } from './editorial-motion'
import type { EditorialEvent, EditorialFrame, EditorialPhoto, EditorialPresentation } from './editorial-scenes'

export const editorialBoardKinds = ['spotlight-sheet', 'context-triptych', 'portrait-radar'] as const
type BoardKind = typeof editorialBoardKinds[number]
type BoardSize = { width: number; height: number }
type BoardItem = { photo: EditorialPhoto; pose: EditorialPortraitPose; alpha: number; label?: string }
type Board = { main: BoardItem; items: BoardItem[]; grid?: { x: number; y: number; radius: number }; label: string; emphasis: number }
type Lettering = (ctx: CanvasRenderingContext2D, previous: string, value: string, x: number, y: number, progress: number, width?: number) => void

function crop(photo: EditorialPhoto): EditorialFrame | undefined {
  const face = photo.landmarks
  const anchors = face?.anchors
  if (!face || !anchors?.leftPupil || !anchors.rightPupil || !anchors.chin || face.confidence < .75) return
  const { width, height } = photo.image
  const eyeX = (anchors.leftPupil.x + anchors.rightPupil.x) * width / 2
  const eyeY = (anchors.leftPupil.y + anchors.rightPupil.y) * height / 2
  const span = Math.abs(anchors.rightPupil.x - anchors.leftPupil.x) * width
  const depth = anchors.chin.y * height - eyeY
  if (span <= 0 || depth <= 0) return
  const w = Math.min(width, span * 3.55), h = Math.min(height, depth * 2.4)
  return {
    x: Math.max(0, Math.min(width - w, eyeX - w / 2)),
    y: Math.max(0, Math.min(height - h, eyeY - h * .43)),
    width: w, height: h,
  }
}

export function editorialBoard(
  kind: BoardKind, presentation: EditorialPresentation, primary: EditorialPhoto, references: EditorialPhoto[],
  size: BoardSize, time: number, duration: number, events: EditorialEvent[], reduced: boolean,
): Board {
  const { width: W, height: H } = size
  const v = presentation.variant
  const reverse = v % 2 ? -1 : 1
  const enter = reduced ? 1 : editorialEase(time / 540)
  const cue = Math.max(events[0]?.atMs ?? duration * .31, Math.min(920, duration * .52))
  const emphasis = reduced ? 1 : editorialEase((time - cue) / Math.min(740, duration * .38))
  const full = editorialCoverPose(primary, { x: 0, y: 0, width: W, height: H })
  const photos = [primary, ...references.slice(0, 3)]
  const item = (photo: EditorialPhoto, frame: EditorialFrame, alpha: number, label?: string): BoardItem =>
    ({ photo, pose: editorialCoverPose(photo, frame, 20, crop(photo)), alpha, label })
  const label = presentation.label ?? (kind === 'spotlight-sheet' ? 'Compare the views' : kind === 'portrait-radar' ? 'Portrait in context' : 'One face, different views')

  if (kind === 'spotlight-sheet') {
    const count = Math.max(2, Math.min(photos.length, 4))
    const w = W * .344, h = H * (count > 2 ? .216 : .30), gap = W * .023
    const top = H * (count > 2 ? .29 : .34), left = (W - 2 * w - gap) / 2
    const slot = (i: number) => ({
      x: count === 3 && i === 2 ? (W - w) / 2 : left + i % 2 * (w + gap), y: top + Math.floor(i / 2) * (h + gap), width: w, height: h,
    })
    const mainSlot = reverse === 1 ? 0 : 1
    const main = item(primary, slot(mainSlot), 1, 'Portrait')
    const hero = item(primary, { x: W * .245, y: H * .29, width: W * .51, height: H * .445 }, 1)
    main.pose = mixEditorialPose(mixEditorialPose(full, main.pose, enter), hero.pose, emphasis)
    const slots = [0, 1, 2, 3].filter(index => index !== mainSlot)
    const items = references.slice(0, 3).map((photo, i) =>
      item(photo, slot(slots[i]), enter * (1 - emphasis * .96), photo.label ?? `View ${i + 2}`))
    return { main, items, label, emphasis: enter }
  }

  if (kind === 'context-triptych') {
    const w = W * .43, h = H * .39
    const main = item(primary, { x: (W - w) / 2, y: H * .32, width: w, height: h }, 1, 'Portrait')
    main.pose = mixEditorialPose(full, main.pose, enter)
    const items = references.slice(0, 2).map((photo, i) => {
      const side = i === 0 ? -reverse : reverse
      const width = W * .253
      return item(photo, { x: W * .5 + side * W * .307 - width / 2, y: H * .375, width, height: H * .285 },
        enter * (.69 - emphasis * .39), photo.label ?? `View ${i + 2}`)
    })
    return { main, items, label, emphasis: enter }
  }

  const x = W * .5, y = H * .53, radius = W * .34
  const middle = W * .205
  const main = item(primary, { x: x - middle / 2, y: y - middle * .59, width: middle, height: middle * 1.18 }, 1, 'Portrait')
  main.pose = mixEditorialPose(full, main.pose, enter)
  const items = references.slice(0, 3).map((photo, i) => {
    const angle = (-.85 + i * 2.1) * reverse
    const w = W * .155
    return item(photo, { x: x + Math.cos(angle) * radius * .85 - w / 2,
      y: y + Math.sin(angle) * radius * .85 - w * .58, width: w, height: w * 1.16 },
    enter * (.88 - emphasis * .29), photo.label ?? `View ${i + 2}`)
  })
  return { main, items, grid: { x, y, radius }, label, emphasis: enter }
}

export function drawEditorialBoard(
  ctx: CanvasRenderingContext2D, board: Board, size: BoardSize, dark: boolean, lettering: Lettering, shared?: EditorialPortraitPose,
) {
  const { width: W, height: H } = size
  ctx.save()
  ctx.fillStyle = dark ? '#151515' : '#f5f4f3'
  ctx.fillRect(0, 0, W, H)
  if (board.grid) {
    const { x, y, radius } = board.grid
    ctx.save()
    ctx.globalAlpha *= board.emphasis
    ctx.strokeStyle = dark ? '#ccc6b9a8' : '#766b638c'
    ctx.lineWidth = 2.8
    for (const fraction of [.37, .67, 1]) {
      ctx.beginPath(); ctx.arc(x, y, radius * fraction, 0, Math.PI * 2); ctx.stroke()
    }
    for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI * .75]) {
      const dx = Math.cos(angle) * radius, dy = Math.sin(angle) * radius
      ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke()
      for (const end of [-1, 1]) {
        const tipX = x + dx * end, tipY = y + dy * end
        ctx.beginPath()
        for (const bend of [-.54, .54]) {
          ctx.moveTo(tipX - Math.cos(angle + bend) * 13 * end, tipY - Math.sin(angle + bend) * 13 * end)
          ctx.lineTo(tipX, tipY)
        }
        ctx.stroke()
      }
    }
    ctx.restore()
  }
  const main = { ...board.main, pose: shared ?? board.main.pose }
  for (const item of [...board.items, main]) {
    if (item.alpha <= 0) continue
    ctx.save()
    ctx.globalAlpha *= item.alpha
    drawEditorialPortrait(ctx, item.photo, item.pose)
    const { frame, radius } = item.pose
    if (frame.width < W * .88) {
      ctx.strokeStyle = dark ? '#ffffff7d' : '#91878081'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(frame.x, frame.y, frame.width, frame.height, radius); ctx.stroke()
      if (item.label && board.emphasis > .5) {
        const label = item.label.toUpperCase()
        ctx.globalAlpha *= editorialEase((board.emphasis - .5) / .5)
        ctx.font = '500 27px monospace'
        const max = frame.width - 34, w = Math.min(max, ctx.measureText(label).width + 24)
        ctx.fillStyle = '#f9f7f5ef'
        ctx.beginPath(); ctx.roundRect(frame.x + 14, frame.y + 13, w, 42, 7); ctx.fill()
        ctx.fillStyle = '#292523'; ctx.fillText(label, frame.x + 26, frame.y + 42, w - 22)
      }
    }
    ctx.restore()
  }
  if (board.emphasis > .45) {
    ctx.fillStyle = dark ? '#f2efec' : '#302824'
    ctx.font = '400 43px Georgia'
    lettering(ctx, '', board.label, W * .145, H * .265, (board.emphasis - .45) / .55, W * .71)
  }
  ctx.restore()
}
