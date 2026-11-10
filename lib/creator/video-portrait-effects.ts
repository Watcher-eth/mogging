import { portraitInstrumentSchema } from './portrait-instruments'
import { portraitPrintIds } from './portrait-print'
import { z } from 'zod'
import { glassOverlaySchema } from './glass-overlay'
export { glassOverlaySchema, defaultGlassOverlay } from './glass-overlay'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { smoothMotion } from './video-layout'
import { scriptTokens } from './video-script'

export const portraitLightingSchema = z.object({
  preset: z.enum(['spot', 'rim', 'split', 'soft']).default('spot'),
  target: z.enum(['whole', 'eyes', 'nose', 'cheeks', 'jaw', 'mouth', 'hair']).default('cheeks'),
  side: z.enum(['left', 'right', 'both']).default('right'),
  ambientEv: z.number().min(-3).max(0).default(-1.4), intensity: z.number().min(0).max(3).default(1.8),
  radius: z.number().min(.1).max(1.5).default(.65),
  lightX: z.number().min(-2).max(2).default(.6), lightY: z.number().min(-2).max(2).default(-.65), depth: z.number().min(.1).max(3).default(1.2),
  color: z.enum(['natural', 'selective', 'split-mono']).default('natural'),
}).strict()
export const portraitEffectsSchema = z.object({ instrument: portraitInstrumentSchema.optional(), print: z.enum(portraitPrintIds).optional(), overlay: glassOverlaySchema.optional(), lighting: portraitLightingSchema.optional() }).strict()
export type PortraitEffects = z.infer<typeof portraitEffectsSchema>
export type PortraitLighting = z.infer<typeof portraitLightingSchema>
export const neutralPortraitLighting = portraitLightingSchema.parse({ preset: 'soft', target: 'whole', ambientEv: 0, intensity: 0, color: 'natural' })
export type WarpRegion = { x: number; y: number; rx: number; ry: number }
export type PortraitWarp = { regions: WarpRegion[]; strengths: number[]; mode: 'pinch' | 'stretch' | 'drag'; axis: 'x' | 'y' | 'both'; shifts?: Array<{ x: number; y: number }> }

export function portraitLightGeometry(landmarks: FaceLandmarksPayload | null | undefined, light: PortraitLighting) {
  const anchors = landmarks?.anchors
  if (!landmarks || landmarks.confidence < .58 || !anchors?.forehead || !anchors.chin || !anchors.noseTip) throw new Error('Portrait lighting needs reliable forehead, nose and chin anchors. Analyze the photo first.')
  const height = anchors.chin.y - anchors.forehead.y
  const left = anchors.leftCheek ?? anchors.jawLeft, right = anchors.rightCheek ?? anchors.jawRight
  if (!left || !right || height <= .08 || Math.abs(right.x - left.x) < .04) throw new Error('Portrait lighting needs a clearly detected facial outline.')
  if ([left, right, anchors.forehead, anchors.chin, anchors.noseTip].some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error('Portrait lighting needs finite detected anchors.')
  const center = { x: (left.x + right.x) / 2, y: (anchors.forehead.y + anchors.chin.y) / 2 }
  const halfWidth = Math.abs(right.x - left.x) * .66
  const targets = light.target === 'eyes' ? [anchors.leftPupil, anchors.rightPupil] : light.target === 'cheeks' ? [anchors.leftCheek, anchors.rightCheek] : light.target === 'jaw' ? [anchors.jawLeft, anchors.jawRight] : light.target === 'nose' ? [anchors.noseTip] : light.target === 'mouth' ? [anchors.mouthCenter ?? anchors.upperLip] : light.target === 'hair' ? [{ x: anchors.forehead.x, y: anchors.forehead.y - height * .28 }] : [center]
  const paired = targets.length === 2 && light.side !== 'both' ? [targets[light.side === 'left' ? 0 : 1]] : targets
  if (paired.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error(`The selected ${light.target} light target has not been detected.`)
  const target = { x: paired.reduce((sum, point) => sum + point!.x, 0) / paired.length, y: paired.reduce((sum, point) => sum + point!.y, 0) / paired.length }
  return { face: [center.x, center.y, halfWidth, height * .56], head: [center.x, anchors.forehead.y + height * .2, halfWidth * 1.3, height * .94], nose: [anchors.noseTip.x, anchors.noseTip.y], target: [target.x, target.y] }
}

export function portraitLightExposure(light: PortraitLighting) {
  const soft = light.preset === 'soft'
  return { shadowEv: soft ? 0 : Math.max(-.85, Math.min(-.18, light.ambientEv)), keyEv: soft ? Math.min(.06, light.intensity * .2) : Math.min(.38, light.intensity * .18), softness: Math.max(.7, light.radius), mode: soft ? 3 : light.preset === 'split' ? 1 : light.preset === 'rim' ? 2 : 0 }
}
export function portraitExposureAt(light: PortraitLighting, face: ReturnType<typeof portraitLightGeometry>, point: { x: number; y: number }) {
  const { shadowEv, keyEv, softness, mode } = portraitLightExposure(light)
  const x = (point.x - face.face[0]) / face.face[2] * (light.lightX < 0 ? -1 : 1)
  const ramp = Math.max(0, Math.min(1, (x + softness) / (2 * softness)))
  const distance = ((point.x - face.target[0]) / face.face[2]) ** 2 + ((point.y - face.target[1]) / face.face[3]) ** 2
  const field = mode === 3 ? 1 : mode === 1 ? ramp * ramp * (3 - 2 * ramp) : mode === 2 ? Math.exp(-(((x - .95) / .5) ** 2)) : Math.exp(-distance / (2 * softness ** 2))
  return shadowEv + (keyEv - shadowEv) * field
}
export function samplePortraitLighting(light: PortraitLighting, text: string, timeMs: number, durationMs: number, words?: Array<{ startMs: number }>, reduced = false): PortraitLighting {
  const tokens = scriptTokens(text)
  const softIndex = tokens.findIndex(word => /^(?:softer|soft|frontal|diffuse|even)$/i.test(word.text))
  const sideIndex = tokens.findIndex(word => /^(?:side|directional|shadows?|split)$/i.test(word.text))
  const soft: PortraitLighting = { ...light, preset: 'soft', target: 'whole', color: 'natural', ambientEv: 0, intensity: .3, radius: 1.5 }
  if (softIndex >= 0 && (sideIndex < 0 || softIndex < sideIndex)) return soft
  if (softIndex < 0) return { ...light, color: 'natural' }
  const start = words?.[softIndex]?.startMs ?? softIndex / Math.max(1, tokens.length) * durationMs
  const amount = reduced ? timeMs >= start ? 1 : 0 : smoothMotion((timeMs - start) / 700)
  // Open the shadow progressively before settling into the neutral soft-front state.
  return amount >= 1 ? soft : { ...light, color: 'natural', ambientEv: light.ambientEv * (1 - amount), intensity: light.intensity * (1 - amount), radius: light.radius + (1.5 - light.radius) * amount }
}

export function warpSourcePoint(point: { x: number; y: number }, warp: PortraitWarp) {
  let horizontal = 0, vertical = 0, weights = 0
  warp.regions.forEach((region, index) => {
    const distance = Math.hypot((point.x - region.x) / region.rx, (point.y - region.y) / region.ry)
    const weight = Math.max(0, 1 - distance * distance) ** 3, strength = warp.strengths[index] ?? 0
    const axisX = warp.axis !== 'y' ? 1 : 0, axisY = warp.axis !== 'x' ? 1 : 0
    if (warp.mode === 'drag') { weights += weight; horizontal -= (warp.shifts?.[index]?.x ?? region.rx * strength) * weight * axisX; vertical -= (warp.shifts?.[index]?.y ?? region.ry * strength) * weight * axisY }
    else { const sign = warp.mode === 'stretch' ? -1 : 1; horizontal += (point.x - region.x) * strength * weight * axisX * sign; vertical += (point.y - region.y) * strength * weight * axisY * sign }
  })
  const normalization = warp.mode === 'drag' ? Math.max(1, weights) : 1
  return { x: point.x + horizontal / normalization, y: point.y + vertical / normalization }
}

export function warpDestinationPoint(point: { x: number; y: number }, warp: PortraitWarp) {
  let destination = { ...point }
  for (let iteration = 0; iteration < 64; iteration++) {
    const sample = warpSourcePoint(destination, warp)
    if (Math.hypot(point.x - sample.x, point.y - sample.y) < 1e-12) break
    destination = { x: destination.x + point.x - sample.x, y: destination.y + point.y - sample.y }
  }
  return destination
}

type Material = { photo: WebGLTexture; mask: WebGLTexture; width: number; height: number; matte?: CanvasImageSource }
type EffectRenderer = { canvas: HTMLCanvasElement; gl: WebGLRenderingContext; locations: Record<string, WebGLUniformLocation | null>; materials: Map<CanvasImageSource, Material> }
let renderer: EffectRenderer | undefined

function releaseMaterial(gl: WebGLRenderingContext, material: Material) {
  gl.deleteTexture(material.photo)
  if (material.mask !== material.photo) gl.deleteTexture(material.mask)
}

function createRenderer(): EffectRenderer {
  const canvas = document.createElement('canvas'), gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true })
  if (!gl) throw new Error('Portrait lighting and liquify need WebGL. Your original photo is unchanged.')
  const shader = (type: number, source: string) => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source); gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const reason = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(`Portrait shader could not compile: ${reason}`) }
    return shader
  }
  const vertex = shader(gl.VERTEX_SHADER, 'attribute vec2 position; varying vec2 uv; void main(){uv=vec2(position.x*.5+.5,.5-position.y*.5);gl_Position=vec4(position,0.,1.);}')
  const fragment = shader(gl.FRAGMENT_SHADER, `precision highp float;
varying vec2 uv; uniform sampler2D photo; uniform sampler2D matte; uniform vec4 regionA; uniform vec4 regionB; uniform vec4 regionC; uniform vec4 regionD; uniform vec4 strengths; uniform vec4 shiftsX; uniform vec4 shiftsY; uniform vec2 axes; uniform float warpMode;
uniform vec4 face; uniform vec2 target; uniform vec3 lightPosition; uniform vec4 illumination; uniform vec4 priorIllumination; uniform vec2 priorTarget; uniform float priorDirection; uniform float lightMix; uniform float lighting;
vec3 offset(vec2 point,vec4 region,float strength,vec2 shift){vec2 delta=(point-region.xy)/max(region.zw,vec2(.001));float weight=pow(max(0.,1.-dot(delta,delta)),3.);vec2 move=warpMode>1.5?-shift*weight*axes:(point-region.xy)*strength*weight*axes*(warpMode>.5?-1.:1.);return vec3(move,weight);}
float exposureField(vec2 samplePoint,vec4 settings,vec2 aimTarget,float directionX){
  vec2 point=(samplePoint-face.xy)/face.zw;
  float direction=directionX<0.?-1.:1.;
  float width=max(.55,settings.z);
  float directional=smoothstep(-width,width,point.x*direction);
  vec2 aim=(samplePoint-aimTarget)/face.zw;
  float spot=exp(-dot(aim,aim)/(2.*width*width));
  float rim=exp(-pow((point.x*direction-.95)/.5,2.));
  float field=settings.w<.5?spot:settings.w<1.5?directional:settings.w<2.5?rim:1.;
  return mix(settings.x,settings.y,field);
}
void main(){vec3 displacement=offset(uv,regionA,strengths.x,vec2(shiftsX.x,shiftsY.x))+offset(uv,regionB,strengths.y,vec2(shiftsX.y,shiftsY.y))+offset(uv,regionC,strengths.z,vec2(shiftsX.z,shiftsY.z))+offset(uv,regionD,strengths.w,vec2(shiftsX.w,shiftsY.w));vec2 samplePoint=uv+displacement.xy/(warpMode>1.5?max(1.,displacement.z):1.);vec4 original=texture2D(photo,clamp(samplePoint,vec2(0.),vec2(1.)));vec3 result=original.rgb;
if(lighting>.0001){
  float subjectMask=texture2D(matte,clamp(samplePoint,vec2(0.),vec2(1.))).a;
  // Blend whole-subject exposure fields, never two differently cropped photographs.
  float ev=mix(exposureField(samplePoint,priorIllumination,priorTarget,priorDirection),exposureField(samplePoint,illumination,target,lightPosition.x),lightMix);
  vec3 linear=pow(max(result,vec3(0.)),vec3(2.2))*exp2(ev);
  float peak=max(linear.r,max(linear.g,linear.b));
  if(peak>.94&&ev>0.)linear*= (.94+.06*(1.-exp(-(peak-.94)/.06)))/peak;
  vec3 lit=pow(max(linear,vec3(0.)),vec3(1./2.2));
  result=mix(result,lit,subjectMask*lighting);
}
gl_FragColor=vec4(result,original.a);}`)
  const program = gl.createProgram()!
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program)
  gl.deleteShader(vertex); gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); throw new Error('Portrait effects could not initialize.') }
  gl.useProgram(program)
  const buffer = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const names = ['photo', 'matte', 'regionA', 'regionB', 'regionC', 'regionD', 'strengths', 'shiftsX', 'shiftsY', 'axes', 'warpMode', 'face', 'target', 'lightPosition', 'illumination', 'priorIllumination', 'priorTarget', 'priorDirection', 'lightMix', 'lighting']
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); if (renderer?.gl === gl) renderer = undefined })
  return { canvas, gl, materials: new Map(), locations: Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)])) }
}

function upload(gl: WebGLRenderingContext, image: HTMLImageElement | HTMLCanvasElement, width: number, height: number) {
  const texture = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  let source = image
  if (width !== image.width || height !== image.height) { const resized = document.createElement('canvas'); resized.width = width; resized.height = height; resized.getContext('2d')!.drawImage(image, 0, 0, width, height); source = resized }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  return texture
}

export function drawPortraitEffects(ctx: CanvasRenderingContext2D, image: HTMLImageElement | HTMLCanvasElement, options: { landmarks?: FaceLandmarksPayload | null; lighting?: PortraitLighting; fromLighting?: PortraitLighting; lightingMix?: number; warp?: PortraitWarp; mask?: HTMLCanvasElement; timeMs?: number; reduced?: boolean }) {
  const geometry = options.lighting ? portraitLightGeometry(options.landmarks, options.lighting) : undefined
  renderer ??= createRenderer()
  const { gl, canvas, locations, materials } = renderer
  let material = materials.get(image)
  if (material && material.matte !== options.mask) { releaseMaterial(gl, material); materials.delete(image); material = undefined }
  if (!material) {
    const scale = Math.min(1, 2304 / Math.max(image.width, image.height), gl.getParameter(gl.MAX_TEXTURE_SIZE) / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale)), height = Math.max(1, Math.round(image.height * scale))
    if (materials.size >= 3) { const key = materials.keys().next().value!; releaseMaterial(gl, materials.get(key)!); materials.delete(key) }
    const photo = upload(gl, image, width, height)
    material = { photo, mask: options.mask && options.mask !== image ? upload(gl, options.mask, width, height) : photo, width, height, matte: options.mask }; materials.set(image, material)
  }
  if (canvas.width !== material.width || canvas.height !== material.height) { canvas.width = material.width; canvas.height = material.height; gl.viewport(0, 0, canvas.width, canvas.height) }
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, material.photo); gl.uniform1i(locations.photo, 0)
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, material.mask); gl.uniform1i(locations.matte, 1)
  const warp = options.warp
  if (warp && warp.regions.length > 4) throw new Error('Portrait edits support up to four registered control regions.')
  for (const [index, name] of ['regionA', 'regionB', 'regionC', 'regionD'].entries()) { const region = warp?.regions[index]; gl.uniform4f(locations[name], region?.x ?? -10, region?.y ?? -10, region?.rx ?? .01, region?.ry ?? .01) }
  gl.uniform4f(locations.strengths, warp?.strengths[0] ?? 0, warp?.strengths[1] ?? 0, warp?.strengths[2] ?? 0, warp?.strengths[3] ?? 0)
  const shifts = [0, 1, 2, 3].map(index => warp?.shifts?.[index] ?? { x: (warp?.regions[index]?.rx ?? 0) * (warp?.strengths[index] ?? 0), y: (warp?.regions[index]?.ry ?? 0) * (warp?.strengths[index] ?? 0) })
  gl.uniform4f(locations.shiftsX, shifts[0].x, shifts[1].x, shifts[2].x, shifts[3].x)
  gl.uniform4f(locations.shiftsY, shifts[0].y, shifts[1].y, shifts[2].y, shifts[3].y)
  gl.uniform2f(locations.axes, warp?.axis === 'y' ? 0 : 1, warp?.axis === 'x' ? 0 : 1)
  gl.uniform1f(locations.warpMode, warp?.mode === 'drag' ? 2 : warp?.mode === 'stretch' ? 1 : 0)
  if (options.lighting && geometry) {
    const light = options.lighting, progress = options.reduced || options.lightingMix !== undefined ? 1 : smoothMotion((options.timeMs ?? 0) / 420)
    gl.uniform4fv(locations.face, geometry.face); gl.uniform2fv(locations.target, geometry.target)
    gl.uniform3f(locations.lightPosition, light.lightX, light.lightY, light.depth)
    const exposure = portraitLightExposure(light)
    gl.uniform4f(locations.illumination, exposure.shadowEv, exposure.keyEv, exposure.softness, exposure.mode)
    const from = options.fromLighting ?? light, prior = portraitLightExposure(from), priorGeometry = options.fromLighting ? portraitLightGeometry(options.landmarks, from) : geometry
    gl.uniform4f(locations.priorIllumination, prior.shadowEv, prior.keyEv, prior.softness, prior.mode)
    gl.uniform2fv(locations.priorTarget, priorGeometry.target); gl.uniform1f(locations.priorDirection, from.lightX)
    gl.uniform1f(locations.lightMix, options.lightingMix ?? 1); gl.uniform1f(locations.lighting, progress)
  } else gl.uniform1f(locations.lighting, 0)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  ctx.drawImage(canvas, 0, 0, image.width, image.height)
}

// Prepare shader compilation and the first material upload before the playback clock runs.
export function preparePortraitEffects(image: HTMLImageElement | HTMLCanvasElement, options: { landmarks?: FaceLandmarksPayload | null; lighting?: PortraitLighting; mask?: HTMLCanvasElement }) {
  const probe = document.createElement('canvas'); probe.width = 1; probe.height = 1
  drawPortraitEffects(probe.getContext('2d')!, image, { ...options, reduced: true })
}
