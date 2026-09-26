import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import type { ContentSlide } from './content-generator'
import { renderSlideMp4 } from './export-slides'

const slide: ContentSlide = { id:'test', templateId:'editorial', imageId:'image', categoryId:'eyes', eyebrow:'Test', headline:'Test export', supportingCopy:'Test', metricLabel:'Eyes', metricValue:'7', cta:'Test', currentScore:'7', potentialScore:'8', categoryScores:[] }
const args = { slide, images:[{id:'image', name:'test', dataUrl:'data:image/png;base64,', width:1080,height:1920,landmarks:null,status:'ready' as const}], width:1080,height:1920 }
const originals = new Map<string, PropertyDescriptor | undefined>()
let tracksStopped = 0
let recorderStopped = 0
function replace(name: string, value: unknown) { originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, {configurable:true,writable:true,value}) }
beforeEach(() => {
  tracksStopped = recorderStopped = 0
  const ctx = new Proxy({}, {get: (_target, key) => key === 'measureText' ? () => ({width:30}) : key === 'createLinearGradient' ? () => ({addColorStop(){}}) : () => {}})
  replace('document', {fonts:{ready:Promise.resolve()},createElement:()=>({getContext:()=>ctx,captureStream:()=>({getTracks:()=>[{stop(){tracksStopped++}}]})})})
  replace('Image', class {width=1080;height=1920;onload=()=>{};set src(_value:string){queueMicrotask(()=>this.onload())}})
  replace('window', {setTimeout:(fn:()=>void)=>setTimeout(fn,0)})
  let time=0
  replace('performance', {now:()=>{time+=1000;return time}})
  replace('VideoEncoder', undefined)
})
afterEach(() => { for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis,name,descriptor); else Reflect.deleteProperty(globalThis,name) } originals.clear() })
class Recorder {
  static isTypeSupported(type:string): boolean {return type === 'video/mp4'}
  state='inactive'
  ondataavailable=(event:{data:Blob})=>{}
  onerror=()=>{}
  onstop=()=>{}
  start(){this.state='recording'}
  stop(){this.state='inactive';recorderStopped++;this.ondataavailable({data:new Blob(['test mp4'])});this.onstop()}
}
test('falls back to MP4 recording when WebCodecs is absent and releases tracks', async()=>{
  replace('MediaRecorder',Recorder)
  const progress=mock(()=>{})
  const blob=await renderSlideMp4(args,progress)
  expect(blob.type).toBe('video/mp4')
  expect(blob.size).toBeGreaterThan(0)
  expect(tracksStopped).toBe(1)
  expect(recorderStopped).toBe(1)
  expect(progress).toHaveBeenLastCalledWith(1)
})
test('reports unavailable MP4 rather than exporting a mislabeled WebM', async()=>{
  replace('MediaRecorder',class extends Recorder {static isTypeSupported(){return false}})
  await expect(renderSlideMp4(args)).rejects.toThrow('not supported')
})
test('releases capture tracks if recorder construction fails', async()=>{
  replace('MediaRecorder',class extends Recorder {constructor(){super();throw new Error('Unavailable recorder')}})
  await expect(renderSlideMp4(args)).rejects.toThrow('Unavailable recorder')
  expect(tracksStopped).toBe(1)
})
test('missing restored photo produces actionable error before encoding',async()=>{
  await expect(renderSlideMp4({...args,images:[]})).rejects.toThrow('Add a clear photo')
})
