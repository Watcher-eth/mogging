import { videoMotion } from './video-layout'

export const previewRippleDurationMs = videoMotion.styleWaveMs

// Shared GPU refraction for style selection and rendered video transitions.
export function createPreviewRipple(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true })
  if (!context) return null
  const gl = context
  const shaders: WebGLShader[] = []
  const textures: WebGLTexture[] = []
  const program = gl.createProgram()!
  const buffer = gl.createBuffer()!
  function shader(type: number, source: string) {
    const value = gl.createShader(type)!
    shaders.push(value); gl.shaderSource(value, source); gl.compileShader(value)
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error('Preview wave shader unavailable')
    return value
  }
  function dispose() {
    textures.forEach(texture => gl.deleteTexture(texture))
    shaders.forEach(value => gl.deleteShader(value))
    gl.deleteBuffer(buffer); gl.deleteProgram(program)
  }
  try {
    gl.attachShader(program, shader(gl.VERTEX_SHADER, `
      attribute vec2 position;
      varying vec2 uv;
      void main() { uv = position * .5 + .5; gl_Position = vec4(position, 0., 1.); }
    `))
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec2 uv;
      uniform sampler2D previous;
      uniform sampler2D incoming;
      uniform float progress;
      uniform float aspect;
      void main() {
        vec2 point = (uv - vec2(.5, .52)) * vec2(aspect, 1.);
        float distance = length(point);
        vec2 direction = point / max(distance, .001) / vec2(aspect, 1.);
        float travel = 1. - pow(1. - progress, 1.6);
        float front = mix(-.065, .72, travel);
        float delta = distance - front;
        float envelope = exp(-delta * delta / .012) * sin(progress * 3.14159);
        float wave = sin(delta * 55.) * envelope;
        vec2 offset = direction * wave * .009;
        vec2 outgoingUV = clamp(uv + offset, vec2(.001), vec2(.999));
        vec2 incomingUV = clamp(uv + offset * .8, vec2(.001), vec2(.999));
        float reveal = 1. - smoothstep(-.065, .065, delta);
        vec3 color = mix(texture2D(previous, outgoingUV).rgb, texture2D(incoming, incomingUV).rgb, reveal);
        float sheen = cos(delta * 55.) * envelope * .025;
        gl_FragColor = vec4(clamp(color + vec3(sheen * .8, sheen * .95, sheen), 0., 1.), 1.);
      }
    `))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Preview wave unavailable')
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    for (const [unit, name] of ['previous', 'incoming'].entries()) {
      const texture = gl.createTexture()!; textures.push(texture)
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, canvas.width, canvas.height, 0, gl.RGB, gl.UNSIGNED_BYTE, null)
      gl.uniform1i(gl.getUniformLocation(program, name), unit)
    }
    const progressLocation = gl.getUniformLocation(program, 'progress')
    const aspectLocation = gl.getUniformLocation(program, 'aspect')
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform1f(aspectLocation, canvas.width / canvas.height)
    gl.uniform1f(progressLocation, 1); gl.drawArrays(gl.TRIANGLES, 0, 6)
    return {
      start(previous: HTMLCanvasElement, incoming: HTMLCanvasElement) {
        gl.useProgram(program); gl.viewport(0, 0, canvas.width, canvas.height)
        gl.uniform1f(aspectLocation, canvas.width / canvas.height)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
        for (const [unit, source] of [previous, incoming].entries()) {
          gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, textures[unit])
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGB, gl.UNSIGNED_BYTE, source)
        }
      },
      updateIncoming(source: HTMLCanvasElement) {
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, textures[1])
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGB, gl.UNSIGNED_BYTE, source)
      },
      draw(elapsedMs: number) {
        const progress = Math.min(1, Math.max(0, elapsedMs / previewRippleDurationMs))
        gl.uniform1f(progressLocation, progress); gl.drawArrays(gl.TRIANGLES, 0, 6)
        return progress < 1
      },
      dispose,
    }
  } catch { dispose(); return null }
}

// Keep transient refraction bounded independently of export resolution.
const videoRipples = new WeakMap<HTMLCanvasElement, { canvas: HTMLCanvasElement; source: HTMLCanvasElement; ripple: ReturnType<typeof createPreviewRipple>; key?: object }>()

export function prepareVideoRipple(incoming: HTMLCanvasElement) {
  let cached = videoRipples.get(incoming)
  if (!cached) {
    const canvas = document.createElement('canvas'), source = document.createElement('canvas')
    canvas.width = source.width = Math.min(720, incoming.width)
    canvas.height = source.height = Math.round(incoming.height * canvas.width / incoming.width)
    cached = { canvas, source, ripple: createPreviewRipple(canvas) }; videoRipples.set(incoming, cached)
  }
  return cached
}

export function drawVideoRipple(ctx: CanvasRenderingContext2D, previous: HTMLCanvasElement, incoming: HTMLCanvasElement, key: object, progress: number) {
  if (typeof document === 'undefined') return false
  const cached = prepareVideoRipple(incoming)
  if (!cached.ripple) return false
  const source = cached.source.getContext('2d')!
  if (cached.key !== key) {
    source.drawImage(previous, 0, 0, cached.source.width, cached.source.height)
    cached.ripple.start(cached.source, cached.source); cached.key = key
  }
  source.drawImage(incoming, 0, 0, cached.source.width, cached.source.height)
  cached.ripple.updateIncoming(cached.source)
  cached.ripple.draw(progress * previewRippleDurationMs)
  ctx.drawImage(cached.canvas, 0, 0, incoming.width, incoming.height)
  return true
}
