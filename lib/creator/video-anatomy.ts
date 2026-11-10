import { isDarkVideoContext } from './video-theme'
import type { CanvasPlacement, CanvasRect } from './canvas-layout'
import type { ReportOverlay } from './report-overlay'
import { videoSize, smoothMotion } from './video-layout'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'

export type AnatomyPose = { focus?: 'whole' | 'jaw' | 'orbits' | 'cheeks' | 'nasal'; action?: 'reveal' | 'focus' | 'isolate' | 'cutaway'; deformation?: number; highlight?: 'tint' | 'outline' | 'none' }
const boneRegions = ['whole', 'jaw', 'orbits', 'cheeks', 'nasal'] as const

export function deformBonePoint(point: { x: number; y: number; z: number }, focus: typeof boneRegions[number], amount: number) {
  const strength = Math.max(-1, Math.min(1, amount))
  if (focus === 'whole') return { x: point.x * (1 + strength * .12), y: point.y, z: point.z * (1 + strength * .08) }
  const centerY = focus === 'jaw' ? -.34 : focus === 'orbits' ? .12 : -.03
  const radiusY = focus === 'jaw' ? .2 : focus === 'orbits' ? .16 : .25
  const centerX = focus === 'cheeks' ? Math.sign(point.x) * .27 : 0, radiusX = focus === 'nasal' ? .13 : focus === 'cheeks' ? .18 : .45
  const distance = ((point.x - centerX) / radiusX) ** 2 + ((point.y - centerY) / radiusY) ** 2 + ((point.z - .25) / .5) ** 2
  const weight = Math.exp(-distance * 2) * strength
  return { x: point.x + (focus === 'nasal' ? point.x * .14 : Math.sign(point.x) * .06) * weight, y: point.y, z: point.z + (focus === 'nasal' ? .07 : .035) * weight }
}
export type AnatomyOrientation = { yaw: number; roll: number }
export type AnatomyRegistration = { frame: CanvasRect; orientation?: AnatomyOrientation; photo?: { image: HTMLImageElement | HTMLCanvasElement; frame: CanvasRect }; reveal: boolean }
export type AnatomyRenderer = { draw: (ctx: CanvasRenderingContext2D, frame: CanvasRect, timeMs: number, durationMs: number, dark: boolean, reduced: boolean, pose?: AnatomyPose, orientation?: AnatomyOrientation) => void }

export function anatomyStageFrame(registration: AnatomyRegistration, timeMs: number, durationMs: number, reduced = false): CanvasRect {
  const from = registration.frame
  const amount = reduced || !registration.reveal ? 1 : smoothMotion((timeMs - 700) / Math.min(1400, durationMs * .4))
  const scale = Math.min(1.18, 780 / from.width, 980 / from.height)
  const width = from.width * scale, height = from.height * scale
  const target = { x: (videoSize.width - width) / 2, y: 1100 - height / 2, width, height }
  return { x: from.x + (target.x - from.x) * amount, y: from.y + (target.y - from.y) * amount, width: from.width + (width - from.width) * amount, height: from.height + (height - from.height) * amount }
}

export function registeredHeadOrientation(landmarks?: FaceLandmarksPayload | null): AnatomyOrientation {
  const { leftPupil: left, rightPupil: right, noseTip: nose } = landmarks?.anchors ?? {}
  if (!left || !right || !landmarks) return { yaw: 0, roll: 0 }
  const [imageLeft, imageRight] = left.x < right.x ? [left, right] : [right, left]
  const dx = (imageRight.x - imageLeft.x) * landmarks.image.width, dy = (imageRight.y - imageLeft.y) * landmarks.image.height
  const distance = Math.hypot(dx, dy)
  if (distance < 1) return { yaw: 0, roll: 0 }
  const eyeRoll = Math.atan2(dy, dx)
  const offset = nose ? ((nose.x - (left.x + right.x) / 2) * landmarks.image.width * Math.abs(dx) + (nose.y - (left.y + right.y) / 2) * landmarks.image.height * dy) / (distance * distance) : 0
  const yaw = landmarks.quality?.yawRadians ?? Math.atan(offset * 1.6)
  const roll = landmarks.quality?.rollRadians ?? eyeRoll
  return { yaw: Math.max(-.7, Math.min(.7, Number.isFinite(yaw) ? yaw : 0)), roll: Number.isFinite(roll) ? -roll : 0 }
}

export function registeredHeadFrame(overlay: ReportOverlay, placement: CanvasPlacement): CanvasRect | undefined {
  const points = overlay.faceBoundary
  if (!points?.length) return
  const projected = points.map(point => ({ x: placement.e + placement.a * point.x / overlay.size.width + placement.c * point.y / overlay.size.height, y: placement.f + placement.b * point.x / overlay.size.width + placement.d * point.y / overlay.size.height }))
  const left = Math.min(...projected.map(point => point.x)), right = Math.max(...projected.map(point => point.x))
  const top = Math.min(...projected.map(point => point.y)), bottom = Math.max(...projected.map(point => point.y))
  return { x: left + (right - left) * .04, y: top - (bottom - top) * .1, width: (right - left) * .92, height: (bottom - top) * 1.08 }
}

export function anatomyMotion(timeMs: number, durationMs: number, pose: AnatomyPose = {}, reduced = false) {
  const progress = Math.max(0, Math.min(1, timeMs / Math.max(1, durationMs)))
  const amount = reduced ? .7 : Math.min(smoothMotion(progress / .28), smoothMotion((1 - progress) / .28))
  const focus = pose.focus ?? 'whole', action = pose.action ?? 'focus'
  return { yaw: reduced || action === 'reveal' ? 0 : (focus === 'jaw' ? .72 : -.38) * amount, pitch: reduced || action === 'reveal' ? 0 : (focus === 'jaw' ? .07 : -.06) * amount, zoom: action === 'reveal' ? 1 : 1 + (focus === 'whole' ? .12 : focus === 'jaw' ? .22 : .32) * amount, amount, cutaway: action === 'cutaway' || action === 'isolate' ? amount : 0 }
}

export function anatomyAlphaBounds(pixels: Uint8Array, width: number, height: number): CanvasRect {
  let left = width, right = 0, bottom = height, top = 0
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
    if (pixels[(row * width + column) * 4 + 3] < 8) continue
    left = Math.min(left, column); right = Math.max(right, column); bottom = Math.min(bottom, row); top = Math.max(top, row)
  }
  return left > right ? { x: 0, y: 0, width, height } : { x: left, y: height - top - 1, width: right - left + 1, height: top - bottom + 1 }
}
let pending: Promise<AnatomyRenderer> | undefined

export function prepareAnatomyRenderer() {
  pending ??= createRenderer().catch(error => { pending = undefined; throw new Error(`Could not prepare the 3D anatomy model: ${error instanceof Error ? error.message : 'WebGL unavailable'}`) })
  return pending
}

async function createRenderer(): Promise<AnatomyRenderer> {
  const [three, { GLTFLoader }] = await Promise.all([import('three'), import('three/addons/loaders/GLTFLoader.js')])
  const model = await new GLTFLoader().loadAsync('/models/scattering-skull.glb')
  const renderer = new three.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
  renderer.setSize(1080, 1200, false); renderer.setPixelRatio(1)
  renderer.outputColorSpace = three.SRGBColorSpace; renderer.toneMapping = three.ACESFilmicToneMapping; renderer.toneMappingExposure = 1
  renderer.localClippingEnabled = true
  const scene = new three.Scene(), subject = new three.Group()
  const bounds = new three.Box3().setFromObject(model.scene), center = bounds.getCenter(new three.Vector3()), size = bounds.getSize(new three.Vector3())
  model.scene.position.sub(center); subject.add(model.scene); subject.scale.setScalar(2.4 / Math.max(size.y, .001)); scene.add(subject)
  const clip = new three.Plane(new three.Vector3(1, 0, 0), 100)
  const focusCenter = new three.Vector3(), focusRadius = new three.Vector3(.4, .4, .5)
  const emphasis = { value: 0 }
  const highlight = { value: 1 }, meshes: Array<import('three').Mesh> = []
  model.scene.traverse(object => {
    if (!(object instanceof three.Mesh)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const original = materials[0] as import('three').MeshStandardMaterial
    const material = new three.MeshPhysicalMaterial({ color: '#bdcbd3', roughness: .6, metalness: .12, clearcoat: .12, clearcoatRoughness: .6, aoMap: original.aoMap, aoMapIntensity: 1.5, clippingPlanes: [clip], side: three.DoubleSide })
    object.geometry.computeBoundingBox()
    const localBounds = object.geometry.boundingBox!, localCenter = localBounds.getCenter(new three.Vector3()), localSize = localBounds.getSize(new three.Vector3())
    const geometry = object.geometry, positions = geometry.getAttribute('position')
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
    const normals = geometry.getAttribute('normal')
    const targets = boneRegions.map(focus => {
      const target = geometry.clone(), targetPositions = target.getAttribute('position')
      for (let index = 0; index < positions.count; index++) {
        const point = { x: (positions.getX(index) - localCenter.x) / localSize.x, y: (positions.getY(index) - localCenter.y) / localSize.y, z: (positions.getZ(index) - localCenter.z) / localSize.z }
        const moved = deformBonePoint(point, focus, 1)
        targetPositions.setXYZ(index, localCenter.x + moved.x * localSize.x, localCenter.y + moved.y * localSize.y, localCenter.z + moved.z * localSize.z)
      }
      target.computeVertexNormals()
      const deltaPosition = new Float32Array(positions.count * 3), deltaNormal = new Float32Array(normals.count * 3), targetNormals = target.getAttribute('normal')
      for (let index = 0; index < positions.count; index++) for (let axis = 0; axis < 3; axis++) {
        deltaPosition[index * 3 + axis] = targetPositions.getComponent(index, axis) - positions.getComponent(index, axis)
        deltaNormal[index * 3 + axis] = targetNormals.getComponent(index, axis) - normals.getComponent(index, axis)
      }
      target.dispose()
      return { position: new three.Float32BufferAttribute(deltaPosition, 3), normal: new three.Float32BufferAttribute(deltaNormal, 3) }
    })
    geometry.morphTargetsRelative = true; geometry.morphAttributes.position = targets.map(target => target.position); geometry.morphAttributes.normal = targets.map(target => target.normal)
    object.updateMorphTargets(); meshes.push(object)
    material.onBeforeCompile = shader => {
      shader.uniforms.boneCenter = { value: localCenter }; shader.uniforms.boneSize = { value: localSize }
      shader.uniforms.featureCenter = { value: focusCenter }; shader.uniforms.featureRadius = { value: focusRadius }; shader.uniforms.featureEmphasis = emphasis
      shader.uniforms.featureHighlight = highlight
      shader.vertexShader = `varying vec3 bonePosition; uniform vec3 boneCenter; uniform vec3 boneSize;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nbonePosition = (position - boneCenter) / boneSize;')
      shader.fragmentShader = `varying vec3 bonePosition; uniform vec3 featureCenter; uniform vec3 featureRadius; uniform float featureEmphasis; uniform float featureHighlight;\n${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
float featureMask = 1.0 - smoothstep(0.35, 1.0, length((bonePosition - featureCenter) / featureRadius));
float rimMask = 1.0 - smoothstep(0.1, 0.5, abs(normalize(vNormal).z));
float selected = featureHighlight > 1.5 ? featureMask * rimMask : featureMask;
diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.72), vec3(0.77, 1.08, 1.18), selected), featureEmphasis * step(0.5, featureHighlight));
#if NUM_CLIPPING_PLANES > 0
float cutEdge = 1.0 - smoothstep(0.0, 0.018, abs(dot(vClipPosition, clippingPlanes[0].xyz) - clippingPlanes[0].w));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.48, 0.84, 0.96), cutEdge * 0.45);
#endif`)
    }
    object.material = material
    materials.forEach(material => material.dispose())
  })
  const key = new three.DirectionalLight('#fff4e6', 3.2), rim = new three.DirectionalLight('#8bd9ff', 2), fill = new three.HemisphereLight('#e7f5ff', '#1b2431', 1.1)
  key.position.set(-3, 4, 5); rim.position.set(3, 1, -2); scene.add(key, rim, fill)
  const camera = new three.PerspectiveCamera(48, 1080 / 1200, .01, 100)
  camera.position.set(0, .1, 5.3); camera.lookAt(0, 0, 0)
  renderer.render(scene, camera)
  const gl = renderer.getContext(), pixels = new Uint8Array(1080 * 1200 * 4)
  gl.readPixels(0, 0, 1080, 1200, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  const base = anatomyAlphaBounds(pixels, 1080, 1200)
  renderer.domElement.addEventListener('webglcontextlost', () => { pending = undefined; renderer.dispose() }, { once: true })
  const frames = new Map<string, { canvas: HTMLCanvasElement; state: string }>()
  return { draw(ctx, frame, timeMs, durationMs, dark, reduced, pose = {}, orientation = { yaw: 0, roll: 0 }) {
    const motion = anatomyMotion(timeMs, durationMs, pose, reduced)
    const identity = `${pose.focus}:${pose.action}:${pose.deformation}:${pose.highlight}:${orientation.yaw}:${orientation.roll}:${dark}`
    const state = `${motion.amount}:${motion.yaw}:${motion.pitch}:${motion.zoom}:${motion.cutaway}`
    let cached = frames.get(identity)
    if (!cached) {
      if (frames.size >= 4) frames.delete(frames.keys().next().value!)
      const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1200
      cached = { canvas, state: '' }; frames.set(identity, cached)
    }
    if (cached.state !== state) {
      const focus = pose.focus ?? 'whole'
      focusCenter.set(0, focus === 'jaw' ? -.34 : focus === 'orbits' ? .12 : focus === 'nasal' ? -.03 : 0, .25)
      focusRadius.set(focus === 'nasal' ? .15 : .4, focus === 'jaw' ? .2 : focus === 'orbits' ? .16 : .32, .5)
      emphasis.value = focus === 'whole' ? 0 : motion.amount * .75
      highlight.value = pose.highlight === 'none' ? 0 : pose.highlight === 'outline' ? 2 : 1
      const deformation = Math.max(-.5, Math.min(.5, pose.deformation ?? 0)) * motion.amount
      for (const mesh of meshes) mesh.morphTargetInfluences?.forEach((_, index, influences) => { influences[index] = boneRegions[index] === focus ? deformation : 0 })
      subject.rotation.set(motion.pitch, orientation.yaw + motion.yaw, orientation.roll)
      camera.position.set(0, .1 + focusCenter.y * motion.amount * .6, 5.3 / motion.zoom); camera.lookAt(0, focusCenter.y * motion.amount * .9, 0)
      if (motion.cutaway > .001) {
        clip.normal.set(pose.action === 'isolate' ? 0 : 1, pose.action === 'isolate' ? -1 : 0, 0).applyEuler(subject.rotation)
        clip.constant = 1.6 * (1 - motion.cutaway) + (pose.action === 'isolate' ? -.25 : .05) * motion.cutaway
      } else clip.constant = 100
      renderer.setClearColor(dark ? '#101215' : '#ffffff', 0)
      renderer.render(scene, camera)
      const snapshot = cached.canvas.getContext('2d')!
      snapshot.clearRect(0, 0, 1080, 1200); snapshot.drawImage(renderer.domElement, 0, 0); cached.state = state
    }
    const scale = Math.min(frame.width / base.width, frame.height / base.height)
    ctx.save()
    if (isDarkVideoContext(ctx)) ctx.filter = 'grayscale(1)'
    ctx.drawImage(cached.canvas, frame.x + (frame.width - base.width * scale) / 2 - base.x * scale, frame.y + (frame.height - base.height * scale) / 2 - base.y * scale, 1080 * scale, 1200 * scale)
    ctx.restore()
  } }
}
