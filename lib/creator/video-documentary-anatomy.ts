import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { videoExportSize, type VideoFrame } from './video-layout'
import type { SemanticBeat } from './video-semantics'
import registration from './sculpture-registration.json'

export type DocumentaryModel = 'skull' | 'head'
const urls = { skull: '/models/scattering-skull.glb', head: '/models/fern-study-head.glb' }
const cache = new Map<DocumentaryModel, ReturnType<GLTFLoader['loadAsync']>>()
const anchors = { nose: 'nose', lips: 'lip', philtrum: 'upperLip', eyes: 'eyeRight', brows: 'brow', jaw: 'jaw', cheeks: 'cheek', ears: 'ear' } as const
const modelAnchor = (feature: SemanticBeat['feature']) => anchors[feature as keyof typeof anchors]

export async function prepareDocumentaryAnatomy(dark: boolean, requested: DocumentaryModel[]) {
  const loaded = await Promise.all(requested.map(async key => {
    let pending = cache.get(key)
    if (!pending) {
      pending = new GLTFLoader().loadAsync(urls[key]).catch(error => { cache.delete(key); throw error })
      cache.set(key, pending)
    }
    return [key, (await pending).scene.clone(true)] as const
  }))
  const gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  gl.setSize(videoExportSize.width, 1180, false)
  gl.toneMapping = THREE.ACESFilmicToneMapping
  gl.toneMappingExposure = 1.05
  const world = new THREE.Scene()
  const models = new Map<DocumentaryModel, { object: THREE.Group; source: THREE.Group }>()
  const materials = new Set<THREE.Material>()
  for (const [key, source] of loaded) {
    const object = new THREE.Group()
    const bounds = new THREE.Box3().setFromObject(source)
    source.position.sub(bounds.getCenter(new THREE.Vector3()))
    object.add(source)
    object.scale.setScalar(3.7 / bounds.getSize(new THREE.Vector3()).y)
    source.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return
      const original = Array.isArray(node.material) ? node.material[0] : node.material
      const material = new THREE.MeshStandardMaterial({
        color: key === 'skull' ? '#cfc2ad' : dark ? '#b8bdba' : '#d8d4c8',
        roughness: .54, metalness: key === 'head' ? .13 : .01,
        aoMap: original.aoMap, normalMap: original.normalMap,
      })
      node.material = material
      materials.add(material)
    })
    object.visible = false
    world.add(object); models.set(key, { object, source })
  }
  world.add(new THREE.HemisphereLight('#b4cdd2', '#4b3a27', 1.2))
  const keyLight = new THREE.DirectionalLight('#fff1db', 3.4)
  const rim = new THREE.DirectionalLight('#a1c5d3', 2.1)
  keyLight.position.set(-3, 4, 5); rim.position.set(3, 1, -4)
  world.add(keyLight, rim)
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 32)
  const origin = new THREE.Vector3()
  return {
    draw(ctx: CanvasRenderingContext2D, model: DocumentaryModel, box: VideoFrame, turn: number, dolly: number, feature?: SemanticBeat['feature']) {
      const target = models.get(model)
      if (!target) return
      for (const entry of models.values()) entry.object.visible = entry === target
      target.object.rotation.y = model === 'skull' ? -.32 + turn * .62 : turn * .86
      const key = feature && model === 'head' ? modelAnchor(feature) : undefined
      const position = key ? registration.male.anchors[key] : undefined
      target.object.updateMatrixWorld(true)
      if (position) target.source.localToWorld(origin.fromArray(position))
      else origin.set(0, 0, 0)
      camera.aspect = box.width / box.height
      camera.updateProjectionMatrix()
      const focus = position ? .58 : .0
      camera.position.set(origin.x * focus + turn * .33, origin.y * focus + .08, (model === 'head' && position ? 6.45 : 7.7) - dolly * .63)
      camera.lookAt(origin.x * focus, origin.y * focus, 0)
      keyLight.position.x = -3 + turn * 2.4
      gl.render(world, camera)
      ctx.drawImage(gl.domElement, box.x, box.y, box.width, box.height)
      if (!position) return
      const point = origin.clone().project(camera)
      if (Math.abs(point.x) >= .94 || Math.abs(point.y) >= .94) return
      return { x: box.x + (point.x + 1) * box.width / 2, y: box.y + (1 - point.y) * box.height / 2 }
    },
    dispose() {
      materials.forEach(material => material.dispose())
      gl.dispose()
      gl.forceContextLoss()
    },
  }
}
