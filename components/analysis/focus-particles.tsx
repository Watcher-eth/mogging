import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'

// Yaw, vertical framing, camera extent, and an elliptical anatomical highlight.
const targets: Record<string, [number, number, number, number, number, number, number, number]> = {
  overall: [.08, 0, 1.83, 0, 0, 1, 1, 0],
  symmetry: [0, .08, 1.67, 0, .16, .14, .82, 0],
  'higher-psl': [.06, .04, 1.69, 0, .16, .7, .91, 0],
  'dating-confidence': [-.16, .03, 1.76, 0, .08, .76, .86, 0],
  jaw: [-.34, -.12, 1.64, .39, -.45, .34, .28, 1],
  cheeks: [.33, .06, 1.64, .47, .05, .25, .29, 1],
  skin: [-.25, .04, 1.64, .45, .02, .32, .34, 1],
  eyes: [-.14, .13, 1.64, .33, .39, .23, .13, 1],
  brows: [.15, .14, 1.68, .34, .52, .27, .12, 1],
  nose: [.37, .06, 1.62, 0, .18, .19, .35, 0],
  mouth: [-.16, -.08, 1.62, 0, -.25, .35, .15, 0],
  hair: [.27, .15, 1.69, 0, .97, .75, .43, 0],
}

export function FocusParticles({ focus = 'overall', accent }: { focus?: string; accent?: string }) {
  const reduce = useReducedMotion()
  const target = targets[focus] ?? targets.overall
  const latest = useRef({ target, accent, reduce })
  latest.current = { target, accent, reduce }
  const mount = useRef<HTMLDivElement>(null)
  const [asset, setAsset] = useState<ArrayBuffer>()
  const [backend, setBackend] = useState<'webgpu' | 'webgl' | 'vector'>('vector')

  useEffect(() => {
    const controller = new AbortController()
    // Surface samples and normals from the creator studio's Cephra Classical Curls sculpture.
    void fetch('/analysis/studio/cephra-particles.bin', { signal: controller.signal })
      .then(response => response.ok ? response.arrayBuffer() : null)
      .then(value => { if (value?.byteLength && !controller.signal.aborted) setAsset(value) }).catch(() => {})
    return () => controller.abort()
  }, [])

  // Header lengths followed by interleaved point/normal samples, then the depth-only mesh.
  const count = asset ? new DataView(asset).getUint32(0, true) : 0
  const samples = asset ? new Int16Array(asset, 12, count * 6) : undefined

  useEffect(() => {
    const host = mount.current
    if (!host || !asset) return
    let stopped = false
    let cleanup = () => {}
    async function create(host: HTMLDivElement, asset: ArrayBuffer) {
      const [three, nodes] = await Promise.all([import('three/webgpu'), import('three/tsl')])
      if (stopped) return
      const renderer = new three.WebGPURenderer({ alpha: true, antialias: true })
      cleanup = () => renderer.dispose()
      await renderer.init()
      if (stopped) return

      const { float, instancedBufferAttribute, mix, smoothstep, uniform, uv, vec2, vec3 } = nodes
      const header = new DataView(asset)
      const count = header.getUint32(0, true)
      const samples = new Int16Array(asset, 12, count * 6)
      const vertexCount = header.getUint32(4, true)
      const indexCount = header.getUint32(8, true)
      const meshOffset = 12 + samples.byteLength
      const meshPositions = Float32Array.from(new Int16Array(asset, meshOffset, vertexCount * 3), n => n / 8192)
      const meshIndices = new Uint16Array(asset, meshOffset + vertexCount * 6, indexCount)
      const geometry = new three.BufferGeometry()
      geometry.setAttribute('position', new three.BufferAttribute(meshPositions, 3))
      geometry.setIndex(new three.BufferAttribute(meshIndices, 1))
      const surfaceMaterial = new three.MeshBasicNodeMaterial({ colorWrite: false })
      const sculpture = new three.Group()
      sculpture.add(new three.Mesh(geometry, surfaceMaterial))
      // Keep the full mesh for depth and sample fewer points evenly across its surface.
      const pointCount = Math.ceil(count * .76)
      const positions = new Float32Array(pointCount * 3)
      const normals = new Float32Array(pointCount * 3)
      for (let index = 0; index < pointCount; index++) {
        const sample = Math.floor(index * count / pointCount)
        for (let axis = 0; axis < 3; axis++) {
          positions[index * 3 + axis] = samples[sample * 6 + axis] / 8192
          normals[index * 3 + axis] = samples[sample * 6 + 3 + axis] / 8192
        }
      }
      const position = instancedBufferAttribute<'vec3'>(new three.InstancedBufferAttribute(positions, 3), 'vec3')
      const normal = instancedBufferAttribute<'vec3'>(new three.InstancedBufferAttribute(normals, 3), 'vec3')
      const scene = new three.Scene()
      const camera = new three.OrthographicCamera(-1, 1, 1, -1, .1, 20)
      camera.position.z = 5
      const time = uniform(0)
      const sweep = uniform(4)
      const pulse = uniform(0)
      const tint = uniform(new three.Color(latest.current.accent ?? '#32ade6'))
      const center = uniform(new three.Vector2())
      const radii = uniform(new three.Vector2(1, 1))
      const paired = uniform(0)
      const focused = uniform(0)
      const pointSize = uniform(2)
      const distance = vec2(mix(position.x, position.x.abs(), paired), position.y).sub(center).div(radii).length()
      const surface = smoothstep(-.02, .36, position.z).mul(focused)
      const mask = float(1).sub(smoothstep(.24, 1.2, distance)).mul(surface)
      const wave = float(1).sub(smoothstep(.035, .21, distance.sub(sweep).abs()))
      const echo = float(1).sub(smoothstep(.02, .17, distance.sub(sweep.sub(.27)).abs())).mul(.34)
      const ring = wave.add(echo).mul(float(1).sub(smoothstep(.9, 1.56, distance))).mul(surface).mul(pulse)
      const shimmer = position.y.mul(4).add(position.x.mul(6)).add(time.mul(1.45)).sin().mul(.006)
      const shading = smoothstep(-.35, .89, normal.dot(vec3(-.53, .65, .49)))
      const front = smoothstep(-.34, .28, normal.z)
      const gray = mix(vec3(.045, .05, .064), vec3(.62, .65, .69), shading)
      const material = new three.PointsNodeMaterial({ transparent: true, alphaTest: .2, depthWrite: true, sizeAttenuation: false })
      material.positionNode = position.add(normal.mul(shimmer.add(.019).add(ring.mul(.038))))
      material.sizeNode = vec2(pointSize.add(float(1).sub(shading).mul(.32)).add(mask.mul(.17)).add(ring.mul(.52)))
      const lit = mix(gray, tint, mask.mul(.86))
      material.colorNode = mix(lit, mix(tint, vec3(1, 1, 1), .28), ring.mul(.9).clamp(0, 1))
      material.opacityNode = float(1).sub(smoothstep(.22, .49, uv().sub(.5).length())).mul(float(.20).add(front.mul(.78)))

      const cloud = new three.Sprite(material)
      cloud.count = pointCount
      cloud.frustumCulled = false
      sculpture.add(cloud)
      scene.add(sculpture)

      let visible = true
      let frame = 0
      let previous = 0
      let elapsed = 0
      let selection = latest.current.target
      let selectedAccent = latest.current.accent
      let selectedAt = 0
      const nextTint = new three.Color(selectedAccent ?? '#32ade6')
      let aspect = 1
      const resize = new ResizeObserver(() => {
        aspect = Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight)
        pointSize.value = Math.min(1.85, Math.max(1.05, host.clientHeight / 285))
        renderer.setSize(host.clientWidth, host.clientHeight)
      })
      const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setClearColor(0xffffff, 0)
      renderer.domElement.setAttribute('aria-hidden', 'true')
      host.appendChild(renderer.domElement)
      resize.observe(host)
      observer.observe(host)
      const current = [...latest.current.target]
      function draw(now: number) {
        if (stopped) return
        frame = requestAnimationFrame(draw)
        const delta = previous ? Math.min(now - previous, 40) : 16
        previous = now
        if (!visible || document.hidden) return
        const { target, accent, reduce } = latest.current
        elapsed += reduce ? 0 : delta / 1000
        const blend = reduce ? 1 : 1 - Math.exp(-delta / 185)
        target.forEach((value, index) => { current[index] += (value - current[index]) * blend })
        time.value = elapsed
        if (selection !== target || selectedAccent !== accent) {
          selection = target
          selectedAccent = accent
          selectedAt = elapsed
          nextTint.set(accent ?? '#32ade6')
        }
        const progress = Math.min(1, (elapsed - selectedAt) / 1.1)
        sweep.value = 1.65 * (1 - (1 - progress) ** 1.45)
        pulse.value = accent && !reduce ? Math.sin(Math.PI * progress) ** .65 : 0
        tint.value.lerp(nextTint, blend)
        center.value.set(current[3], current[4])
        radii.value.set(current[5], current[6])
        paired.value = current[7]
        focused.value += ((accent ? 1 : 0) - focused.value) * blend
        sculpture.rotation.y = current[0] + (reduce ? 0 : Math.sin(elapsed * .65) * .065)
        const extent = Math.max(current[2], 1.48 + Math.abs(current[1]), 1.14 / aspect)
        camera.left = -extent * aspect
        camera.right = extent * aspect
        camera.top = extent + current[1]
        camera.bottom = -extent + current[1]
        camera.updateProjectionMatrix()
        renderer.render(scene, camera)
      }
      frame = requestAnimationFrame(draw)
      setBackend((renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl')
      cleanup = () => {
        cancelAnimationFrame(frame)
        resize.disconnect()
        observer.disconnect()
        renderer.domElement.remove()
        material.dispose()
        geometry.dispose()
        surfaceMaterial.dispose()
        renderer.dispose()
      }
    }
    void create(host, asset).catch(() => { if (!stopped) { cleanup(); setBackend('vector') } })
    return () => { stopped = true; cleanup() }
  }, [asset])

  return <div className="desktop-particle-art" data-renderer={backend}>
    <div ref={mount} className="desktop-particle-render" aria-hidden="true" />
    {backend === 'vector' && samples && <svg className="desktop-particle-render" viewBox="-1.65 -1.65 3.3 3.3" aria-hidden="true">
      <motion.g animate={{ y: target[1] * .3, scale: 1.62 / target[2] }} transition={{ duration: reduce ? 0 : .55 }}>
        {Array.from({ length: Math.floor(samples.length / 108) }, (_, index) => {
          const offset = index * 108
          const [x, y, z] = [samples[offset], samples[offset + 1], samples[offset + 2]].map(value => value / 8192)
          if (z < -.09) return null
          const highlight = accent && Math.hypot(((target[7] ? Math.abs(x) : x) - target[3]) / target[5], (y - target[4]) / target[6]) < 1
          return <circle key={index} cx={x} cy={-y} r=".005" fill={highlight ? accent : '#858994'} />
        })}
      </motion.g>
    </svg>}
    <div className="desktop-particle-fade" aria-hidden="true" />
  </div>
}
