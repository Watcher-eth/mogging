import { drawScanInvitation, type CreatorBrand } from './brand'
import { videoBrandFrame } from './video-branding'
import { applyGlassInk } from './glass-overlay'
import { createPortraitPillTrack, pillMotion } from './video-pill-morph'
import { profileStudySchema } from './video-profile'
import { decodeVisualBeat } from './video-semantics'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { activeScene, type VideoComposition, type VideoScene } from './video-composition'
import { captionStyle, drawLyricsCaption } from './video-captions'
import { sampleCaptionAppearance } from './caption-contrast'
import { videoSize, captionDesign, smoothMotion } from './video-layout'
import { preparePortraitProgram, samplePortraitProgram, planPortraitProgram, type PreparedPortraitProgram } from './portrait-program'
import { portraitMetricFor, drawPortraitMetricPill } from './portrait-metric'
import { drawScientificEvidence } from './video-research'
import { drawPhotoStudy, photoStudyGesture, photoStudyRegions, warpStudyOverlay } from './video-photo-study'
import { warpDestinationPoint, type PortraitWarp } from './video-portrait-effects'
import { requireUsableMedia, mediaCropFit } from './media-asset'
import type { GeneratorImage } from './content-generator'

type Kind = NonNullable<VideoScene['documentary']>['kind']
type Shot = { scene: VideoScene; kind: Kind; startMs: number; durationMs: number }
type Photo = { card: THREE.Group; mesh: THREE.Mesh; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; source: GeneratorImage; image: HTMLImageElement; program?: PreparedPortraitProgram; activity?: ReturnType<typeof samplePortraitProgram>; warp?: PortraitWarp }
type Set = { group: THREE.Group; photos: Photo[]; skull?: THREE.Group }
export type DocumentaryRenderer = { draw(ctx: CanvasRenderingContext2D, time: number, width: number, height: number, reduced: boolean): void; seekMedia(time: number, signal?: AbortSignal): Promise<void>; assetFits: Array<{ sceneId: string; imageId: string; coverage: number }>; fork(): Promise<DocumentaryRenderer>; dispose(): void }
let model: ReturnType<GLTFLoader['loadAsync']> | undefined
const font = '"Mogging Share", Arial, sans-serif'

export function documentaryShots(composition: VideoComposition): Shot[] {
  return composition.scenes.flatMap(scene => {
    const base = { scene, kind: scene.documentary?.kind ?? 'stage', startMs: scene.startMs, durationMs: scene.durationMs }
    // Give both the generic structure and the registered photo their own readable hold.
    if (base.kind !== 'relations' || scene.durationMs < 6000) return [base]
    const first = Math.round(scene.durationMs * .42)
    return [{ ...base, kind: 'anatomy' as const, durationMs: first }, { ...base, startMs: scene.startMs + first, durationMs: scene.durationMs - first }]
  })
}

function canvas(width: number, height: number) { const value = document.createElement('canvas'); value.width = width; value.height = height; return value }
function map(source: HTMLCanvasElement) { const texture = new THREE.CanvasTexture(source); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture }
function text(value: string, size = 52, color = '#d9d1c1') {
  const image = canvas(1200, 150), ctx = image.getContext('2d')!
  ctx.font = `400 ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(value, 600, 75)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.8, .475), new THREE.MeshBasicMaterial({ map: map(image), transparent: true, depthWrite: false, toneMapped: false }))
  return mesh
}
function box(width: number, height: number, depth: number, color: string, roughness = .75) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color, roughness, metalness: .05 }))
  mesh.castShadow = true; mesh.receiveShadow = true; return mesh
}

function photoActivity(photo:Photo,shot:Shot,local:number,reduced:boolean) {
  if(!photo.program)return
  const delay=reduced?0:shot.kind==='relations'?600:shot.kind==='comparison'?350:0
  return local<delay?undefined:samplePortraitProgram(photo.program,local-delay,shot.durationMs-delay,shot.scene.words?.map(word=>({startMs:word.startMs-(shot.startMs-shot.scene.startMs)-delay})),reduced)
}

// Texture-space registration makes the ink follow exactly the same projection as its photo.
function drawInk(photo: Photo, shot: Shot, local: number, reduced: boolean) {
  const { canvas: image, source, program } = photo, ctx = image.getContext('2d')!
  ctx.clearRect(0, 0, image.width, image.height)
  const study=shot.scene.photoStudy, landmarks=source.landmarks
  photo.warp=study?photoStudyGesture(study,photoStudyRegions(landmarks,study.feature),local,shot.durationMs,reduced,landmarks).warp:undefined
  if(study){ctx.save();ctx.scale(image.width/source.width,image.width/source.width);drawPhotoStudy(ctx,photo.image,landmarks,study,local,shot.durationMs,reduced);ctx.restore()}
  else ctx.drawImage(photo.image, 0, 0, image.width, image.height)
  photo.activity=undefined
  if (program) {
    const activity = photoActivity(photo,shot,local,reduced)
    photo.activity=activity
    if (activity) {
      const overlay=photo.warp?warpStudyOverlay(activity.to,photo.warp):activity.to
      const scale = image.width / source.width, paths = overlay.primitives.flatMap(p => p.kind === 'polyline' ? [p.pixelPoints] : [])
      const reveal = reduced ? 1 : smoothMotion(activity.elapsedMs / 250)
      ctx.save(); ctx.scale(scale, scale); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      const dashed = activity.stroke === 'dotted' ? [2, 9] : activity.stroke === 'dashed' ? [14, 8] : []
      ctx.setLineDash(dashed)
      for (const path of paths) {
        const count = Math.max(1, Math.ceil((path.length - 1) * reveal))
        ctx.beginPath(); path.slice(0, count + 1).forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y))
        applyGlassInk(ctx, 1 / scale, 4.2, activity.treatment === 'highlight' ? '#f4deb4cc' : undefined); ctx.stroke()
      }
      // Notes attach to a measured contour endpoint, never a guessed facial region.
      const point = paths[0]?.[0]
      if (point && reveal > .9 && ['note', 'arrow', 'scribble'].includes(activity.treatment)) {
        const right = point.x < source.width * .5, toX = Math.max(source.width * .08, Math.min(source.width * .92, point.x + (right ? -1 : 1) * source.width * .2)), toY = Math.max(50, point.y - source.height * .06)
        ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(toX, toY); ctx.strokeStyle = '#fff5dd'; ctx.lineWidth = 2 / scale; ctx.stroke()
        ctx.font = `400 ${24 / scale}px ${font}`; ctx.textAlign = right ? 'left' : 'right'
        ctx.shadowColor = 'rgba(231,244,255,.42)'; ctx.shadowBlur = 4 / scale; ctx.fillStyle = '#fff5dd'; ctx.fillText(activity.label.toUpperCase(), toX, toY - 8 / scale)
      }
      ctx.restore()
    }
  }
  photo.texture.needsUpdate = true
}

export async function prepareDocumentary(composition: VideoComposition, images: GeneratorImage[], decoded: Map<string, HTMLImageElement>, brand: CreatorBrand | null = null): Promise<DocumentaryRenderer> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(1); renderer.setSize(1080, 1920, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const world = new THREE.Scene(); world.background = new THREE.Color('#17201e'); world.fog = new THREE.Fog('#17201e', 18, 40)
  const camera = new THREE.PerspectiveCamera(43, 9 / 16, .05, 60)
  const floor = box(60, .1, 60, '#28322e'); floor.position.y = -.1; world.add(floor)
  const back = box(32, 16, .3, '#202a26'); back.position.set(0, 6, -5); world.add(back)
  // A real opening, reveal mullions and foreground shadow give the camera depth cues.
  for (let i = 0; i < 5; i++) {
    const column = box(.07, 10, .2, '#191d19'); column.position.set(-6 + i * 2.4, 4, -4.5); world.add(column)
  }
  const key = new THREE.DirectionalLight('#fff0dd', 2.8); key.position.set(-4, 9, 7); key.castShadow = true
  key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -8; key.shadow.camera.right = 8; key.shadow.camera.top = 10; key.shadow.camera.bottom = -3; key.shadow.normalBias = .025; world.add(key)
  world.add(new THREE.HemisphereLight('#c4d7de', '#171e19', .65))
  const rim = new THREE.DirectionalLight('#a9d0c0', 3); rim.position.set(4, 5, -2); world.add(rim)
  const sets = new Map<string, Set>(), shots = documentaryShots(composition), videos = new Map<string, HTMLVideoElement>()
  let disposed = false
  try {
    const media = new Map((composition.media ?? []).map(asset => [asset.id, asset]))
    await Promise.all(shots.filter(shot => shot.kind === 'media').map(async shot => {
      const asset = media.get(shot.scene.documentary?.mediaId ?? '')
      if (!asset) throw new Error('The documentary media shot is missing its source asset')
      requireUsableMedia(asset)
      if (asset.scope.kind === 'private') throw new Error('Private context footage is not enabled in this renderer yet')
      if (asset.kind !== 'video') throw new Error('Context footage requires a video asset')
      const video = document.createElement('video'); video.crossOrigin = 'anonymous'; video.muted = true; video.playsInline = true; video.preload = 'auto'
      await new Promise<void>((resolve, reject) => { const timer = window.setTimeout(() => { video.removeAttribute('src'); video.load(); reject(new Error('Context footage took too long to load')) }, 30000); video.onloadeddata = () => { clearTimeout(timer); resolve() }; video.onerror = () => { clearTimeout(timer); reject(new Error('Could not load context footage')) }; video.src = asset.url; video.load() })
      if (!Number.isFinite(video.duration) || video.duration * 1000 + 34 < shot.durationMs) throw new Error('Choose footage long enough for this scene')
      if (video.videoWidth !== asset.width || video.videoHeight !== asset.height || !mediaCropFit(asset, { width: 1080, height: 1920 }).native) throw new Error('The source footage does not meet this shot’s native-resolution requirements')
      videos.set(asset.id, video)
    }))
    if (shots.some(shot => shot.kind === 'anatomy')) model ??= new GLTFLoader().loadAsync('/models/scattering-skull.glb').catch(error => { model = undefined; throw error })
    const gltf = shots.some(shot => shot.kind === 'anatomy') ? await model : undefined
    function addPhoto(set: Set, id: string, x: number, y: number, width: number, height: number, rotation = 0, crop?: { x: number; y: number; width: number; height: number }, fullWidth = false) {
      const source = images.find(image => image.id === id), image = decoded.get(id)
      if (!source || !image) throw new Error('A documentary photograph is missing')
      const surface = canvas(Math.min(1536, source.width), Math.round(Math.min(1536, source.width) * source.height / source.width)), texture = map(surface)
      const region = crop ?? { x: 0, y: 0, width: 1, height: 1 }
      const ratio = source.width * region.width / (source.height * region.height), planeRatio = width / height
      // Extend the source edges across the frame while keeping the portrait scale uniform.
      const u = fullWidth || ratio > planeRatio ? region.width * planeRatio / ratio : region.width
      const v = fullWidth || ratio > planeRatio ? region.height : region.height * ratio / planeRatio
      texture.repeat.set(u, v); texture.offset.set(region.x + (region.width - u) / 2, 1 - region.y - region.height + (region.height - v) / 2)
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }))
      mesh.position.set(x, y, .04); mesh.rotation.y = rotation
      const backing = box(width + .045, height + .045, .07, '#c5c0ae'); backing.position.set(x, y, -.01); backing.rotation.y = rotation
      const card = new THREE.Group(); card.add(backing, mesh); set.group.add(card)
      for (const item of [backing, mesh]) { item.material.transparent = true }
      set.photos.push({ card, mesh, canvas: surface, texture, source, image })
      return card
    }
    for (const [index, shot] of shots.entries()) {
      const set: Set = { group: new THREE.Group(), photos: [] }; set.group.visible = false; world.add(set.group); sets.set(String(index), set)
      const scene = shot.scene, id = scene.source.imageId!
      if (shot.kind === 'comparison') {
        addPhoto(set, scene.source.secondaryImageId!, -1.15, 4.25, 2.12, 3.65, .045)
        addPhoto(set, id, 1.15, 4.25, 2.12, 3.65, -.045)
        for (const [i, label] of ['BEFORE', 'AFTER'].entries()) { const title = text(label, 46); title.scale.setScalar(.55); title.position.set(i ? 1.15 : -1.15, 6.38, .1); set.group.add(title) }
      } else if (shot.kind === 'anatomy' && gltf) {
        const skull = new THREE.Group(), clone = gltf.scene.clone(true), bounds = new THREE.Box3().setFromObject(clone), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3())
        clone.position.sub(center); skull.add(clone); skull.scale.setScalar(3.65 / size.y); skull.position.set(0, 3.65, .2); set.group.add(skull); set.skull = skull
        clone.traverse(object => { if (!(object instanceof THREE.Mesh)) return; const original = Array.isArray(object.material) ? object.material[0] : object.material; object.material = new THREE.MeshStandardMaterial({ color: '#c5c5b2', roughness: .8, metalness: 0, aoMap: original.aoMap, aoMapIntensity: .8, normalMap: original.normalMap }); object.castShadow = true; object.receiveShadow = true })
        const plinth = box(3, .3, 2.1, '#494c43'); plinth.position.set(0, 1.45, .1); set.group.add(plinth)
        const label = text('GENERIC ANATOMY · ILLUSTRATION', 33); label.position.set(0, 6.25, .2); set.group.add(label)
      } else if (shot.kind === 'relations') {
        const source = images.find(image => image.id === id)!, anchors = source.landmarks?.anchors
        // Relationship panels use real source coordinates, not a synthetic facial reconstruction.
        const regions = [anchors?.leftPupil && anchors?.rightPupil ? { x: Math.max(0, Math.min(anchors.leftPupil.x, anchors.rightPupil.x) - .12), y: (anchors.leftPupil.y + anchors.rightPupil.y) / 2 - .04, width: Math.min(.8, Math.abs(anchors.leftPupil.x - anchors.rightPupil.x) + .24), height: .10 } : undefined,
          anchors?.noseTip ? { x: anchors.noseTip.x - .2, y: anchors.noseTip.y - .13, width: .4, height: .2 } : undefined,
          anchors?.mouthCenter ? { x: anchors.mouthCenter.x - .26, y: anchors.mouthCenter.y - .055, width: .52, height: .11 } : undefined]
        if (regions.some(region => !region || region.x < 0 || region.y < 0 || region.x + region.width > 1 || region.y + region.height > 1)) addPhoto(set, id, 0, 3.7, 4.2, 7.47)
        else regions.forEach((region, i) => {
          const crop = region!, width = [2.4, 1.6, 2.15][i], ratio = source.width * crop.width / (source.height * crop.height), height = width / ratio
          const x = [-.55, .8, -.55][i], y = [5.45, 3.9, 2.25][i]
          const card = addPhoto(set, id, x, y, width, height, 0, crop)
          const label = text(['EYE AREA', 'BRIDGE / BASE', 'UPPER LIP'][i], 36); label.scale.setScalar(.45); label.position.set(x, y + height / 2 + .2, .06); card.add(label)
          if (i < 2) {
            const material = new THREE.LineBasicMaterial({ color: '#d0c19a', transparent: true, opacity: .5 })
            const points = [new THREE.Vector3(x, y - height / 2 - .1, -.05), new THREE.Vector3(x, y - height / 2 - .28, -.05), new THREE.Vector3(i ? -.55 : .8, y - height / 2 - .28, -.05)]
            set.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material))
          }
        })
      } else if (shot.kind !== 'media') {
        addPhoto(set, id, 0, 3.85, 5.95, 7.54, shot.kind === 'conclusion' ? -.025 : .025, undefined, true)
      }
      set.photos.forEach(photo => {
        if (scene.portraitProgram) {
          const a = photo.source.landmarks?.anchors, yaw = Math.abs(photo.source.landmarks?.quality?.yawRadians ?? 0)
          const view = /profile/i.test(photo.source.id) || yaw > .55 ? 'profile' : /three-quarter/i.test(photo.source.id) || yaw > .22 ? 'three-quarter' : 'front'
          const side = (a?.noseTip?.x ?? .5) > ((a?.leftPupil?.x ?? .5) + (a?.rightPupil?.x ?? .5)) / 2 ? 'right' : 'left'
          const profile = view === 'front' ? undefined : profileStudySchema.parse({ view, side, feature: 'nose' })
          const program = view === 'front' ? scene.portraitProgram : planPortraitProgram(scene.narration, decodeVisualBeat(scene.narration).feature, 'feature-study', composition.variation, view)
          photo.program = preparePortraitProgram(program, photo.source, profile, photo.image)
        }
        drawInk(photo, shot, 0, false)
      })
    }
    function placeCamera(shot: Shot, local: number, reduced: boolean) {
      const p = reduced ? .5 : smoothMotion(local / shot.durationMs)
      const inspection = shot.kind === 'inspection', anatomy = shot.kind === 'anatomy', portrait = ['stage','inspection','conclusion'].includes(shot.kind)
      camera.position.set((anatomy ? -.9 : -.2) + p * (anatomy ? 1.7 : .38), anatomy ? 4.2 : portrait ? 3.65 : 4.0, (portrait ? 10.96 : 10.5) - p * (inspection ? .65 : .45))
      camera.lookAt(0, anatomy ? 3.7 : portrait ? 3.62 : 3.85, 0)
      if (shot.kind === 'stage' && !reduced) { const enter = 1 - Math.pow(1 - Math.min(1, local / 2200), 3); camera.position.x += 1.4 * (1 - enter); camera.position.z += 1.4 * (1 - enter); camera.lookAt(0, 3.62, 0) }
      camera.updateMatrixWorld(true)
    }
    const assetFits: DocumentaryRenderer['assetFits'] = []
    world.updateMatrixWorld(true)
    shots.forEach((shot, index) => {
      const set = sets.get(String(index))!
      for (const photo of set.photos) {
        let coverage = Infinity
        for (const time of [0, shot.durationMs / 2, shot.durationMs - 1]) {
          placeCamera(shot, time, false)
          const parameters = (photo.mesh.geometry as THREE.PlaneGeometry).parameters
          const corners = [-1, 1].flatMap(x => [-1, 1].map(y => photo.mesh.localToWorld(new THREE.Vector3(x * parameters.width / 2, y * parameters.height / 2, 0)).project(camera)))
          const width = (Math.max(...corners.map(p => p.x)) - Math.min(...corners.map(p => p.x))) * 540, height = (Math.max(...corners.map(p => p.y)) - Math.min(...corners.map(p => p.y))) * 960
          coverage = Math.min(coverage, mediaCropFit(photo.source, { width: width / Math.max(1, photo.texture.repeat.x), height }, { width: Math.min(1, photo.texture.repeat.x), height: photo.texture.repeat.y }).coverage)
        }
        assetFits.push({ sceneId: shot.scene.id, imageId: photo.source.id, coverage })
        if (coverage < 1) throw new Error(`The ${shot.kind} close-up needs a higher-resolution image: ${photo.source.name} (${Math.round(coverage * 100)}% native coverage)`)
      }
    })
    function find(time: number) { const index = Math.max(0, shots.findLastIndex(shot => shot.startMs <= time)); return { shot: shots[index], set: sets.get(String(index))! } }
    const measurementContext = canvas(1, 1).getContext('2d')!
    measurementContext.font=`500 ${pillMotion.fontSize}px ${font}`
    const pillTrack=createPortraitPillTrack(text=>measurementContext.measureText(text).width,time=>{
      const {shot,set}=find(time),scene=activeScene(composition,time),photo=set.photos.find(p=>p.source.id===scene.source.imageId)
      if(!photo)return
      const local=time-shot.startMs,study=shot.scene.photoStudy
      const warp=study?photoStudyGesture(study,photoStudyRegions(photo.source.landmarks,study.feature),local,shot.durationMs,false,photo.source.landmarks).warp:undefined
      return portraitMetricFor(scene,photoActivity(photo,shot,local,false),photo.source.landmarks,time-scene.startMs,warp)
    },composition.durationMs)
    return {
      assetFits,
      fork: () => prepareDocumentary(composition, images, decoded, brand),
      async seekMedia(time, signal) {
        signal?.throwIfAborted(); const { shot } = find(time)
        if (shot.kind !== 'media') return
        const video = videos.get(shot.scene.documentary?.mediaId ?? '')!
        const target = Math.min(Math.max(0, (time - shot.startMs) / 1000), video.duration - .001)
        if (Math.abs(video.currentTime - target) < .001 && video.readyState >= 2) return
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => finish(new Error('Context footage seek timed out')), 10000)
          const finish = (error?: Error) => { clearTimeout(timer); video.removeEventListener('seeked', done); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve() }
          const done = () => finish(), abort = () => finish(new DOMException('Cancelled', 'AbortError'))
          video.addEventListener('seeked', done, { once: true }); signal?.addEventListener('abort', abort, { once: true }); video.currentTime = target
        })
      },
      draw(ctx, time, width, height, reduced) {
        if (disposed) return
        const { shot, set } = find(time), local = Math.max(0, time - shot.startMs), p = reduced ? .5 : smoothMotion(local / shot.durationMs)
        sets.forEach(item => { item.group.visible = item === set })
        placeCamera(shot, local, reduced)
        if (set.skull) set.skull.rotation.y = -.3 + p * .65
        set.photos.forEach((photo, i) => {
          const stagger = shot.kind === 'relations' ? i * 100 : shot.kind === 'comparison' ? i * 80 : 0
          const enter = reduced || !['relations', 'comparison'].includes(shot.kind) ? 1 : smoothMotion((local - stagger) / 350)
          photo.card.position.z = -.65 * (1 - enter); photo.card.rotation.y = (i % 2 ? -.08 : .08) * (1 - enter)
          photo.card.traverse(object => { if (object instanceof THREE.Mesh && !Array.isArray(object.material)) object.material.opacity = enter })
          drawInk(photo, shot, local, reduced)
        })
        ctx.save(); ctx.setTransform(width / videoSize.width, 0, 0, height / videoSize.height, 0, 0)
        if (shot.kind === 'media') {
          const video = videos.get(shot.scene.documentary?.mediaId ?? '')!, scale = Math.max(videoSize.width / video.videoWidth, videoSize.height / video.videoHeight)
          ctx.fillStyle = '#1b1d1c'; ctx.fillRect(0, 0, videoSize.width, videoSize.height); ctx.drawImage(video, (videoSize.width - video.videoWidth * scale) / 2, (videoSize.height - video.videoHeight * scale) / 2, video.videoWidth * scale, video.videoHeight * scale)
        } else { renderer.render(world, camera); ctx.drawImage(renderer.domElement, 0, 0, videoSize.width, videoSize.height) }
        if (shot.kind === 'media') { const asset = media.get(shot.scene.documentary?.mediaId ?? '')!; if (asset.source.usage !== 'owned') { ctx.font = `400 24px ${font}`; ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 6; ctx.fillText([asset.source.author, asset.source.provider, asset.source.license].filter(Boolean).join(' · '), 120, 1660, 1000); ctx.shadowBlur = 0 } }
        const fade = ctx.createLinearGradient(0, 1380, 0, videoSize.height); fade.addColorStop(0, '#15191500'); fade.addColorStop(.55, '#151915b0'); fade.addColorStop(1, '#151915f2'); ctx.fillStyle = fade; ctx.fillRect(0, 1380, videoSize.width, videoSize.height - 1380)
        const scene = activeScene(composition, time), sceneTime = time - scene.startMs
        const pillFrame=pillTrack.sample(time,reduced)
        for(const photo of set.photos) {
          if(photo.source.id!==scene.source.imageId)continue
          const metric=portraitMetricFor(scene,photo.activity,photo.source.landmarks,sceneTime,photo.warp) ?? (reduced?undefined:pillFrame.metric),chin=photo.source.landmarks?.anchors.chin
          if(!metric || !chin || metric.imageId!==photo.source.id)continue
          const anchor=photo.warp?warpDestinationPoint(chin,photo.warp):chin
          const uv={x:(anchor.x-photo.texture.offset.x)/photo.texture.repeat.x,y:(1-anchor.y-photo.texture.offset.y)/photo.texture.repeat.y}
          if(uv.x<0 || uv.x>1 || uv.y<0 || uv.y>1)continue
          const geometry=photo.mesh.geometry as THREE.PlaneGeometry
          const point=photo.mesh.localToWorld(new THREE.Vector3((uv.x-.5)*geometry.parameters.width,(uv.y-.5)*geometry.parameters.height,0)).project(camera)
          if(point.z < -1 || point.z > 1)continue
          drawPortraitMetricPill(ctx,{metric,chin:{x:(point.x*.5+.5)*width,y:(.5-point.y*.5)*height},opacity:1},reduced,reduced?undefined:pillFrame)
        }
        if(shot.kind!=='conclusion')drawScientificEvidence(ctx,composition,time,reduced,580)
        if (shot.kind === 'conclusion') {
          ctx.save(); const enter = reduced ? 1 : smoothMotion(sceneTime / 350); ctx.globalAlpha = enter; ctx.translate(0, 14 * (1 - enter))
          drawScanInvitation(ctx, brand, videoBrandFrame(true)); ctx.restore()
        }
        if (scene.text) {
          const { width, height } = captionStyle(scene)
          const leftShift = 22
          const frame = { x: captionDesign.inset - leftShift, y: captionDesign.top, width, height }
          const { ink } = sampleCaptionAppearance(ctx, frame, '#fff')
          const previous = activeScene(composition, scene.startMs - 1)
          const handoff = previous !== scene && sceneTime < captionDesign.focusMs
            ? { previous, progress: smoothMotion(sceneTime / captionDesign.focusMs) }
            : undefined
          ctx.save()
          ctx.translate(-leftShift, frame.y)
          drawLyricsCaption(ctx, scene, sceneTime, reduced, ink, handoff)
          ctx.restore()
        }
        ctx.restore()
      },
      dispose() {
        if (disposed) return; disposed = true
        const geometries = new globalThis.Set<THREE.BufferGeometry>(), materials = new globalThis.Set<THREE.Material>(), textures = new globalThis.Set<THREE.Texture>()
        world.traverse(object => { if (!(object instanceof THREE.Mesh)) return; geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) { materials.add(material); for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value) } })
        geometries.forEach(value => value.dispose()); textures.forEach(value => value.dispose()); materials.forEach(value => value.dispose())
        videos.forEach(video => { video.removeAttribute('src'); video.load() }); renderer.dispose(); renderer.forceContextLoss()
      },
    }
  } catch (error) { renderer.dispose(); renderer.forceContextLoss(); throw error }
}
