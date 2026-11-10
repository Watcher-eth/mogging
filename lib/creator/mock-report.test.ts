import { afterEach, expect, spyOn, test } from 'bun:test'
import { randomScore, randomScorePair, scoreRanges, type ScoreRange } from './random-scores'
import { reportCategories } from './mock-report-data'
import { drawMockReport, drawScorePair, drawFeatureCard, nativeMetricFeature, mockFeatureLayout, mockReportFormat, mockReportHeroHeight, mockReportSize } from './mock-report'
import { drawSlideFrame } from './export-slides'
import type { ContentSlide } from './content-generator'

let random: ReturnType<typeof spyOn> | undefined
afterEach(() => random?.mockRestore())

test('native cards keep unscored descriptions without inventing a chart', () => {
  const scored = { label: 'Under-chin contour', value: 'Smooth transition', visual: 'Text', grade: 7.4 }
  expect(nativeMetricFeature(scored).visual).toBe('Rail')
  expect(scored.visual).toBe('Text')
  expect(nativeMetricFeature({ label: 'Eye area', value: '8.1 / 10', visual: 'Text', scale: 'quality', positions: [.81] }).visual).toBe('Orbit')
  const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? (text: string) => ({ width: text.length * 7 }) : () => {}, set: () => true }) as CanvasRenderingContext2D
  for (const [feature, chart] of [[scored, true], [{ label: 'Contour', value: 'Smooth transition', visual: 'Text' }, false]] as const) {
    const parts: string[] = []
    drawFeatureCard(ctx, feature, 354, 145, 1, 'metric', (_, node) => { parts.push(node.id) })
    expect(parts.includes('metric/surface')).toBe(true)
    expect(parts.includes('metric/visual')).toBe(chart)
  }
})

test('random scores respect every range, including rounded endpoints and the PSL cap', () => {
  random = spyOn(Math, 'random')
  for (const range of Object.keys(scoreRanges) as ScoreRange[]) {
    for (const maximum of [8, 10]) {
      for (const sample of [0, .01, .25, .5, .75, .99, .999999]) {
        random.mockReturnValue(sample)
        const value = Number(randomScore(range, maximum))
        expect(value).toBeGreaterThanOrEqual(scoreRanges[range].min)
        expect(value).toBeLessThanOrEqual(Math.min(maximum, scoreRanges[range].max))
      }
    }
  }
})

test('potential remains at least current while both stay in the chosen range', () => {
  random = spyOn(Math, 'random').mockReturnValueOnce(.99).mockReturnValueOnce(.01)
  expect(randomScorePair('low')).toEqual({ current: '1.0', potential: '2.5' })
})

test('iPhone export dimensions support H.264 and preserve the hero crop ratio', () => {
  expect(mockReportFormat.width % 2).toBe(0)
  expect(mockReportFormat.height % 2).toBe(0)
  expect(mockReportFormat.width / mockReportFormat.height).toBe(mockReportSize.width / mockReportSize.height)
  expect(mockReportHeroHeight).toBe(Math.round(mockReportSize.height * .55))
})

test('every mobile report category draws its complete feature grid and growth section through the export renderer', () => {
  expect(reportCategories.map(item => item.id)).toEqual(['eyes', 'brows', 'nose', 'mouth', 'jaw', 'cheeks', 'face-shape', 'proportions', 'symmetry', 'skin', 'hair', 'ears', 'overall'])
  for (const category of reportCategories) {
    const texts: string[] = []
    let saves = 0
    const ctx = new Proxy({}, { get: (_target, key) => {
      if (key === 'fillText') return (text: string) => texts.push(text)
      if (key === 'measureText') return (text: string) => ({ width: text.length * 7 })
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} })
      if (key === 'save') return () => saves++
      if (key === 'restore') return () => saves--
      return () => {}
    } }) as CanvasRenderingContext2D
    const slide: ContentSlide = { id: 'test', templateId: 'mock-report', categoryId: category.id, imageId: 'test', currentScore: '6.3', potentialScore: '8.2', categoryScores: [], eyebrow: '', headline: '', supportingCopy: '', metricLabel: category.title, metricValue: '', cta: '', mockReport: { category, scroll: 0 } }
    drawSlideFrame(ctx, slide, null, null, mockReportFormat.width, mockReportFormat.height, 4000, null)
    expect(texts.join('')).toContain('6.3')
    expect(texts.join('')).toContain('8.2')
    expect(texts).not.toContain('Growth Opportunities')
    expect(texts).toContain('Your potential')
    expect(texts).toContain('Clear upside')
    expect(texts).toContain('Now 6.3')
    expect(texts).toContain('+1.9 potential')
    expect(texts).toContain(category.id === 'overall' ? 'Your priorities' : 'Action Plan')
    for (const feature of category.features) expect(texts.join(' ')).toContain(feature.label)
    expect(saves).toBe(0)
  }
})


test('category grids mirror mobile full-width instruments and alternate chart/text partners without overlaps', () => {
  for (const category of reportCategories) {
    const { tiles } = mockFeatureLayout(category)
    const rows = new Map<number, typeof tiles>()
    for (const tile of tiles) rows.set(tile.top, [...rows.get(tile.top) ?? [], tile])
    let bottom = -10
    for (const [top, row] of rows) {
      expect(top).toBeGreaterThanOrEqual(bottom + 10)
      expect(row.length).toBeLessThanOrEqual(2)
      if (row.length === 2) {
        expect(row.filter(tile => tile.showVisual).length).toBeLessThanOrEqual(1)
        expect(row[0].x + row[0].width + 10).toBe(row[1].x)
      }
      bottom = top + row[0].height
      for (const tile of row) {
        expect(tile.x).toBeGreaterThanOrEqual(18)
        expect(tile.x + tile.width).toBeLessThanOrEqual(372)
        expect(tile.height).toBe(row[0].height)
      }
    }
  }
  const jaw = mockFeatureLayout(reportCategories.find(category => category.id === 'jaw')!).tiles
  expect(jaw.find(tile => tile.feature.id === 'jaw.height')!.width).toBe(354)
  expect(jaw.some(tile => !tile.showVisual)).toBe(true)
  expect(jaw.some(tile => tile.width === 172 && tile.showVisual)).toBe(true)
})


test('PSL potential retains its own eight-point label and scale beside the ten-point overall score', () => {
  const labels:string[]=[]
  const ctx=new Proxy({globalAlpha:1}, {get:(target,key)=>key==='measureText'?(text:string)=>({width:text.length*7}):key==='fillText'?(text:string)=>labels.push(text):Reflect.get(target,key)??(()=>{}),set:(target,key,value)=>Reflect.set(target,key,value)}) as unknown as CanvasRenderingContext2D
  const paint:import('./canvas-layout').CanvasPainter=(context,node)=>node.draw?.(context,paint)
  drawScorePair(ctx,{currentScore:'8',potentialScore:'7',potentialScale:8,potentialCurrentScore:7} as ContentSlide,354,1,paint)
  expect(labels).toContain('PSL POTENTIAL')
  expect(labels).toContain('/ 8')
  expect(labels).toContain('/ 10')
})

test('embedded device reports paint the portrait behind the status bar instead of leaving a white header band',()=>{
  const ctx=new Proxy({},{get:(_,key)=>key==='measureText'?(text:string)=>({width:text.length*7}):()=>{}}) as CanvasRenderingContext2D
  const category=reportCategories.find(c=>c.id==='overall')!
  const slide={id:'embedded',templateId:'handheld-report',categoryId:'overall',currentScore:'7.4',potentialScore:'8.2',categoryScores:[],mockReport:{category,scroll:0}} as unknown as ContentSlide
  let viewport:{x:number;y:number;width:number;height:number}|undefined
  const paint:import('./canvas-layout').CanvasPainter=(context,node)=>{
    if(node.id==='report')node.draw?.(context,paint)
    if(node.id==='report-viewport')viewport=node.frame
  }
  drawMockReport(ctx,slide,null,null,390,844,4000,undefined,{deviceChrome:true,paint})
  expect(viewport).toEqual({x:0,y:0,width:390,height:760})
})
