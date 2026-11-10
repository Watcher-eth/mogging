/// <reference types="@webgpu/types" />

import { sampleScanWave, scanGlint, scanGlintCount, waveTiming } from './scan-wave-motion'

// Photo refraction and color band adapted from Libraries.dev Distortion Waves.
// Copyright (c) 2026 Jakub Antalik (MIT). See scan-wave-LICENSE.txt.
const shader = /* wgsl */ `
struct Wave {
  size: vec2f,
  origin: vec2f,
  front: vec4f,
  motion: vec4f,
  edge: vec4f,
  photoBox: vec4f,
}
@group(0) @binding(0) var<uniform> wave: Wave;
@group(0) @binding(1) var photo: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

struct Vertex { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn vertex(@builtin(vertex_index) index: u32) -> Vertex {
  let uv = array(vec2f(0,0), vec2f(2,0), vec2f(0,2))[index];
  return Vertex(vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0, 1), uv);
}

fn bell(x: f32) -> f32 { return exp(-x * x); }

fn readPhoto(point: vec2f) -> vec3f {
  let uv = (point - wave.photoBox.xy) / wave.photoBox.zw;
  return textureSampleLevel(photo, linearSampler, uv, 0).rgb;
}

fn blurPhoto(point: vec2f, blur: f32) -> vec3f {
  let offset = vec2f(blur * .72, blur);
  return readPhoto(point) * .40 + (
    readPhoto(point + offset) + readPhoto(point - offset) +
    readPhoto(point + vec2f(offset.x, -offset.y)) + readPhoto(point + vec2f(-offset.x, offset.y))
  ) * .15;
}

@fragment fn fragment(input: Vertex) -> @location(0) vec4f {
  let p = input.uv * wave.size;
  let unit = wave.edge.x;
  let raw = p - wave.origin;
  let time = wave.front.w;
  let mx = raw.x * wave.front.z;
  let v = vec2f(max(abs(mx) - wave.front.y, 0), raw.y);
  let len = max(length(v), .001);
  let gradient = vec2f(v.x * sign(raw.x) * wave.front.z, v.y) / len;
  let g = max(length(gradient), .001);
  let along = mx / unit;
  let bend = .62 * sin(along * .0058 + time * 1.1) + .38 * sin(along * .01218 - time * 1.5 + 1.7);
  let d = (len - wave.front.x) / g + wave.motion.y * bend;
  let n = gradient / g;
  let energy = wave.motion.x;
  let strength = wave.motion.w;

  let lift = bell(d / (150.0 * unit * select(1.5, .85, d > 0)));
  let swell = n * energy * 34.0 * unit * lift;
  let r = max(length(raw), 1);
  let inward = raw / r;
  let point = p - swell + inward * wave.motion.z * exp(-r / (900.0 * unit));
  let split = (swell - inward * wave.motion.z * exp(-r / (240.0 * unit))) * .065;
  let blur = energy * 9.0 * unit * bell(d / (unit * select(240.0, 90.0, d > 0)));

  let inset = min(min(p.x, wave.size.x - p.x), min(p.y, wave.size.y - p.y));
  let edge = bell(inset / (11.0 * unit));
  let reached = 1.0 - smoothstep(-91.0 * unit, 65.0 * unit, d);
  let kept = smoothstep(-343.0 * unit, 343.0 * unit, d + (wave.front.x - wave.edge.y) / g);
  let perimeterPhase = atan2(p.y / wave.size.y - .5, p.x / wave.size.x - .5);
  let shimmer = .7 + .3 * sin(perimeterPhase * 5.0 - time * 3.4);
  let rim = edge * reached * kept * wave.edge.z * shimmer * .24;
  let hair = (1.0 - smoothstep(.7 * unit, 2.1 * unit, inset)) * reached * kept * wave.edge.z * .58;

  let lobes = .5 + .5 * sin(along * .00884 + time * 1.4) * cos(along * .00408 - time * .7 + 1.2);
  let k = clamp(1.0 - d / (130.0 * unit), 0, 1);
  let lead = k*k*k*(k*(k*6.0-15.0)+10.0);
  let tail = pow(clamp(1.0 + d / (300.0 * unit * mix(.6, 1.3, lobes)), 0, 1), 2.3);
  let frost = select(tail, lead, d >= 0) * strength * .085;
  let across = d / unit;
  let reflection = .48 + .52 * pow(abs(cos(along * .009 + time * .85)), 2.0);
  let specular = strength * reflection * (
    .32 * bell((across - 2.0) / 2.8) + .21 * bell((across + 5.5) / 12.0)
  );
  let lensOpacity = clamp(length(point-p) * .48 + length(split) * .16 + blur * .21, 0, 1);
  let coverage = 1.0 - (1.0 - lensOpacity) * (1.0 - frost) * (1.0 - specular) * (1.0 - rim) * (1.0 - hair);
  if (coverage < .003) { return vec4f(0); }

  var col = readPhoto(p);
  if (lensOpacity > .003) {
    let middle = blurPhoto(point, blur);
    col = vec3f(mix(middle.r, readPhoto(point - split).r, .57), middle.g, mix(middle.b, readPhoto(point + split).b, .57));
  }
  let glass = vec3f(.89, .93, .965);
  let depth = .08 * strength * bell((across + 12.0) / 6.0);
  col = mix(col * lensOpacity * (1.0 - depth), glass, frost);
  col = mix(col, vec3f(1.0), specular);
  col = mix(col, glass, rim);
  col = mix(col, vec3f(1.0), hair);
  return vec4f(col, coverage);
}
`

const glintShader = /* wgsl */ `
@group(0) @binding(0) var<uniform> size: vec2f;
@group(0) @binding(1) var<storage, read> glints: array<vec4f>;

struct Dot { @builtin(position) position: vec4f, @location(0) offset: vec2f, @location(1) opacity: f32 }

@vertex fn vertex(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> Dot {
  let dot = glints[instance];
  let offset = array(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(1,1))[vertex];
  let point = (dot.xy + offset * dot.z * 1.6) / size;
  return Dot(vec4f(point.x * 2.0 - 1.0, 1.0 - point.y * 2.0, 0, 1), offset, dot.w);
}
@fragment fn fragment(dot: Dot) -> @location(0) vec4f {
  let alpha = dot.opacity * (1.0 - smoothstep(.13, 1.0, length(dot.offset)));
  return vec4f(vec3f(.98,.99,1) * alpha, alpha);
}
`

export async function runScanRipple(
  canvas: HTMLCanvasElement,
  imageSrc: string,
  fit: 'cover' | 'contain',
  durationMs: number,
  loop: boolean,
  signal: AbortSignal,
  onReady: (ready: boolean) => void,
) {
  if (!navigator.gpu || signal.aborted) return
  const image = new Image()
  image.src = imageSrc
  const [adapter] = await Promise.all([navigator.gpu.requestAdapter({ powerPreference: 'low-power' }), image.decode()])
  if (!adapter || signal.aborted) return
  const context = canvas.getContext('webgpu')
  if (!context) return
  const device = await adapter.requestDevice()
  let texture: GPUTexture | undefined
  let uniformBuffer: GPUBuffer | undefined
  let glintBuffer: GPUBuffer | undefined
  let observer: ResizeObserver | undefined
  let frame = 0
  let disposed = false
  let configured = false

  function dispose() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    observer?.disconnect()
    if (configured) context?.unconfigure()
    texture?.destroy()
    uniformBuffer?.destroy()
    glintBuffer?.destroy()
    device.destroy()
    signal.removeEventListener('abort', dispose)
  }

  signal.addEventListener('abort', dispose, { once: true })
  if (signal.aborted) { dispose(); return }

  try {
    const format = navigator.gpu.getPreferredCanvasFormat()
    const waveModule = device.createShaderModule({ code: shader })
    const dots = device.createShaderModule({ code: glintShader })
    const [pipeline, glints] = await Promise.all([
      device.createRenderPipelineAsync({
        layout: 'auto',
        vertex: { module: waveModule, entryPoint: 'vertex' },
        fragment: { module: waveModule, entryPoint: 'fragment', targets: [{ format }] },
      }),
      device.createRenderPipelineAsync({
        layout: 'auto', primitive: { topology: 'triangle-strip' },
        vertex: { module: dots, entryPoint: 'vertex' },
        fragment: { module: dots, entryPoint: 'fragment', targets: [{
          format, blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }] },
      }),
    ])
    if (disposed) return
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
    const bitmap = await createImageBitmap(image, {
      resizeWidth: Math.max(1, Math.round(image.naturalWidth * scale)),
      resizeHeight: Math.max(1, Math.round(image.naturalHeight * scale)),
      resizeQuality: 'high',
    })
    if (disposed) { bitmap.close(); return }
    try {
      const size = [bitmap.width, bitmap.height] as const
      texture = device.createTexture({
        size, format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      })
      device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, size)
    } finally { bitmap.close() }
    context.configure({ device, format, alphaMode: 'premultiplied' })
    configured = true
    const buffer = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    uniformBuffer = buffer
    const binding = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: texture.createView() },
        { binding: 2, resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
      ],
    })
    const instances = new Float32Array(scanGlintCount * 4)
    glintBuffer = device.createBuffer({ size: instances.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    const glintBinding = device.createBindGroup({
      layout: glints.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer, size: 16 } }, { binding: 1, resource: { buffer: glintBuffer } }],
    })
    const uniforms = new Float32Array(20)
    let width = 0
    let height = 0
    function resize() {
      width = canvas.clientWidth
      height = canvas.clientHeight
      if (!width || !height) return
      const pixels = Math.min(window.devicePixelRatio || 1, 1.5, 840 / Math.max(width, height))
      canvas.width = Math.max(1, Math.round(width * pixels))
      canvas.height = Math.max(1, Math.round(height * pixels))
      const photoScale = (fit === 'cover' ? Math.max : Math.min)(width / image.naturalWidth, height / image.naturalHeight)
      const photoWidth = image.naturalWidth * photoScale
      const photoHeight = image.naturalHeight * photoScale
      uniforms.set([width, height], 0)
      uniforms.set([(width - photoWidth) / 2, (height - photoHeight) / 2, photoWidth, photoHeight], 16)
    }
    observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const start = performance.now()
    let ready = false
    let resting = false
    function draw(now: number) {
      if (disposed) return
      const elapsed = Math.max(0, now - start)
      if (!loop && elapsed >= durationMs) { dispose(); onReady(false); return }
      if (width && height) {
        const fraction = loop ? waveTiming.activeFraction : 1
        const progress = Math.min(1, (elapsed % durationMs) / (durationMs * fraction))
        if (progress >= 1 && resting) { frame = requestAnimationFrame(tick); return }
        resting = progress >= 1
        const sample = sampleScanWave(progress, width, height)
        uniforms.set(sample.origin, 2)
        uniforms.set(sample.front, 4)
        uniforms.set(sample.motion, 8)
        uniforms.set(sample.edge, 12)
        device.queue.writeBuffer(buffer, 0, uniforms)
        const encoder = device.createCommandEncoder()
        const pass = encoder.beginRenderPass({ colorAttachments: [{
          view: context!.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store',
        }] })
        if (progress < 1) {
          pass.setPipeline(pipeline)
          pass.setBindGroup(0, binding)
          pass.draw(3)
          for (let i = 0; i < scanGlintCount; i++) instances.set(scanGlint(i, sample), i * 4)
          device.queue.writeBuffer(glintBuffer!, 0, instances)
          pass.setPipeline(glints)
          pass.setBindGroup(0, glintBinding)
          pass.draw(4, scanGlintCount)
        }
        pass.end()
        device.queue.submit([encoder.finish()])
        if (!ready) { ready = true; onReady(true) }
      }
      frame = requestAnimationFrame(tick)
    }

    function tick(now: number) {
      try { draw(now) } catch { dispose(); onReady(false) }
    }
    void device.lost.then(() => { if (!disposed) { dispose(); onReady(false) } })
    frame = requestAnimationFrame(tick)
  } catch {
    dispose()
    onReady(false)
  }
}
