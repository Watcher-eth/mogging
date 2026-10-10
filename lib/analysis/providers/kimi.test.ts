import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { z } from 'zod'
import { analysisProviderResultSchema } from '../schema'
import { AnalysisProviderError } from '../errors'
import { buildAnalysisPrompt, ANALYSIS_SYSTEM_PROMPT, CATEGORY_IDS } from '../prompt'

// Use the real provider/parser in an isolated context, with no API credentials or network.
const source = readFileSync(new URL('./kimi.ts', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from [^\n]+\n/gm, '').replace(/^export /gm, '')
const transpiler = new Bun.Transpiler({ loader: 'ts' })
const input = { imageDataUrl: 'data:image/jpeg;base64,test', gender: 'other' }
function provider(fetch: (url: string, init?: RequestInit) => Promise<Response>, timeout = 100_000, clock: Pick<DateConstructor, 'now'> = Date) {
  const context: any = { z, analysisProviderResultSchema, AnalysisProviderError, buildAnalysisPrompt,
    ANALYSIS_SYSTEM_PROMPT, CATEGORY_IDS, Date: clock, AbortController, setTimeout, clearTimeout,
    env: { MOONSHOT_API_KEY: 'test', KIMI_ANALYSIS_MODEL: 'test', MOONSHOT_BASE_URL: 'https://test.invalid' },
    fetch, console: { warn() {} } }
  runInNewContext(transpiler.transformSync(source.replace('100_000', String(timeout)) + '\nglobalThis.provider = new KimiAnalysisProvider();'), context)
  return context.provider
}
function report() {
  return { faceDetected: true, pslScore: 5, harmonyScore: 6, dimorphismScore: 6, angularityScore: 6,
    report: { summary: 'Visible proportions.', categories: CATEGORY_IDS.map(id => ({ id, title: id,
      subtitle: 'Visible structure', scoreLabel: 'Score', score: 6,
      features: Array.from({length:id === 'overall' ? 6 : 4},(_,i)=>({label:`Feature ${i}`,value:'Visible balance'})),
      explanation: 'Visible features have balanced spacing.', recommendation: 'Maintain the current grooming routine.' })) } }
}
function completion(body: unknown, reason = 'stop') {
  return new Response(JSON.stringify({ choices: [{ finish_reason: reason, message: { content: typeof body === 'string' ? body : JSON.stringify(body) } }], usage: { completion_tokens: 3000 } }))
}

test('complete report retains legacy schema and empty optional measurements are omitted without changing observations', async () => {
  const body = report()
  Object.assign(body.report.categories[0].features[0], {measurement:''})
  Object.assign(body.report.categories[0].features[1], {measurement:'  '})
  Object.assign(body.report.categories[0].features[2], {measurement:null})
  Object.assign(body.report.categories[0].features[3], {measurement:'3.2°'})
  let calls = 0
  const result = await provider(async(_,init)=>{
    calls++
    const request = JSON.parse(String(init?.body))
    expect(request.max_tokens).toBe(6000)
    expect(request.messages[1].content[1].text).toContain('overall category must have exactly 6')
    return completion(body)
  }).analyzeFace(input)
  expect(calls).toBe(1)
  expect(result.report.categories).toHaveLength(11)
  expect(result.report.categories[0].features[0].measurement).toBeUndefined()
  expect(result.report.categories[0].features[3].measurement).toBe('3.2°')
})

test('missing categories, duplicate IDs and overlong advice trigger one corrected generation rather than a fabricated report', async () => {
  for (const defect of ['missing','duplicate','long','no-report']) {
    const bad = report()
    if (defect === 'missing') delete (bad.report as any).categories
    if (defect === 'duplicate') bad.report.categories[0].id = 'nose'
    if (defect === 'long') bad.report.categories[0].recommendation = 'x'.repeat(221)
    if (defect === 'no-report') delete (bad as any).report
    const prompts: string[] = []
    const result = await provider(async(_,init)=>{
      prompts.push(JSON.parse(String(init?.body)).messages[1].content[1].text)
      return completion(prompts.length === 1 ? bad : report())
    }).analyzeFace(input)
    expect(prompts).toHaveLength(2)
    expect(prompts[1]).toContain('entire corrected JSON')
    expect(result.report.categories).toHaveLength(11)
  }
})

test('length-limited or malformed JSON regenerates within the same provider operation', async () => {
  for (const reason of ['length','stop']) {
    let calls = 0
    const result = await provider(async()=> ++calls === 1 ? completion('{"faceDetected":true',reason) : completion(report())).analyzeFace(input)
    expect(calls).toBe(2)
    expect(result.faceDetected).toBe(true)
  }
})

test('two invalid generations still fail; no fallback observations or partial report count as success', async () => {
  let calls = 0
  await expect(provider(async()=>{calls++; return completion('{broken')}).analyzeFace(input)).rejects.toMatchObject({code:'provider_invalid_json'})
  expect(calls).toBe(2)
})

test('HTTP authentication, rate-limit and server errors do not cause another provider call', async () => {
  for (const status of [401,429,503]) {
    let calls = 0
    await expect(provider(async()=>{calls++; return new Response('provider rejection',{status})}).analyzeFace(input)).rejects.toBeInstanceOf(AnalysisProviderError)
    expect(calls).toBe(1)
  }
})

test('no-face response is accepted as no face, with no report invention', async () => {
  const result = await provider(async()=>completion({faceDetected:false,pslScore:null,harmonyScore:0,dimorphismScore:0,angularityScore:0,report:null})).analyzeFace(input)
  expect(result.faceDetected).toBe(false)
  expect(result.report).toBeNull()
})

test('one total deadline covers both generations instead of resetting the budget', async () => {
  let time = 0
  let calls = 0
  class Clock extends Date { static now() {return time} }
  await expect(provider(async()=>{ calls++; time += 90_000; return completion('{broken') },100_000,Clock).analyzeFace(input)).rejects.toMatchObject({code:'provider_invalid_json'})
  expect(calls).toBe(1)
})

test('stalled response body remains covered by the deadline and is not retried as invalid JSON', async () => {
  let calls = 0
  const face = provider(async(_,init)=>{
    calls++
    return {ok:true,json:()=>new Promise((_,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('aborted'))))} as Response
  },20)
  await expect(face.analyzeFace(input)).rejects.toMatchObject({code:'provider_unavailable'})
  expect(calls).toBe(1)
})
