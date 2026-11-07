import {expect, test} from 'bun:test'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'

function fixture() {
  const images: Array<{source: string; x: number; y: number; width: number; height: number}> = []
  const clips: number[][] = [], brands: number[][] = []
  const ctx = new Proxy({}, {get: (_target, key) => key === 'drawImage'
    ? (image: any,x:number,y:number,width:number,height:number) => images.push({source:image.path??'report',x,y,width,height})
    : key === 'roundRect' ? (...args:number[]) => clips.push(args)
    : key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({addColorStop(){}}) : () => {}})
  const scope: any = {Promise,Math,WeakMap,
    Image: class {path='';onload=()=>{};set src(value:string){this.path=value;queueMicrotask(()=>this.onload())}},
    document:{createElement:()=>({width:0,height:0,getContext:()=>ctx})},
    loadPosterAssets:async()=>{},drawMockReport(){},
    drawTemplateBrandRow:(_ctx:unknown,_brand:unknown,width:number,y:number)=>brands.push([0,y,width]),
    drawTemplateInvitation(){},
    elementEntrance:()=>1, videoMotion:{portraitEnterMs:650},
  }
  const source=readFileSync(new URL('./phone-report.ts',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace(/^export /gm,'')
  runInNewContext(new Bun.Transpiler({loader:'ts'}).transformSync(source+'\nglobalThis.api={loadPhoneFrame,loadHandheldPhone,drawPhoneReport,drawHandheldReport}'),scope)
  return {ctx,images,clips,brands,api:scope.api}
}
const slide={headline:'Ascend Now'}

test('square iPhone shows its upper 75 percent below its heading and branding',async()=>{
  const f=fixture();await f.api.loadPhoneFrame();f.api.drawPhoneReport(f.ctx,slide,null,null,1080,1080,4000)
  const phone=f.images.find(image=>image.source.includes('iphone-16'))!
  expect(phone.x).toBeGreaterThan(0);expect(phone.x+phone.width).toBeLessThan(1080)
  expect((1080-phone.y)/phone.height).toBeCloseTo(.75)
  expect(phone.width).toBeGreaterThan(1080*.4)
  const [,brandY,brandWidth]=f.brands[0]
  expect(brandY+brandWidth*.15).toBeLessThan(phone.y)
})

test('square handheld report and branding occupy separate areas without cropping the display',async()=>{
  const f=fixture();await f.api.loadHandheldPhone();f.api.drawHandheldReport(f.ctx,slide,null,null,1080,1080,4000,null)
  const [x,y,width,height]=f.clips[0]
  expect(x).toBeGreaterThan(0);expect(y).toBeGreaterThan(0)
  expect(x+width).toBeLessThan(1080);expect(y+height).toBeLessThan(1080)
  const [,brandY,brandWidth]=f.brands[0]
  expect(brandY+brandWidth*.15).toBeLessThan(y)
})

test('portrait phone retains its scale and leaves room for the notification and heading',async()=>{
  const f=fixture();await f.api.loadPhoneFrame();f.api.drawPhoneReport(f.ctx,slide,null,null,1080,1620,4000)
  const phone=f.images.find(image=>image.source.includes('iphone-16'))!
  expect(phone.height).toBe(1620*.94);expect(phone.y).toBe(Math.max(1620*.205,1620*.04+1080*.278))
  expect(f.brands[0]).toEqual([0,1620*.04,1080])
})
