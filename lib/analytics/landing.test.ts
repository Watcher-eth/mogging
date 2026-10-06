import { expect, test } from 'bun:test'
import { createLandingAssignment, landingArms, landingProperties, parseLandingAssignment, readLandingCookie, serializeLandingAssignment, isActiveLandingAssignment, landingExperiments } from './landing'
import { landingExperimentRows, landingRateInterval, landingExperimentSummary } from '../admin/landing'

test('allocates visitors evenly into the single old-versus-new experiment and round-trips stable cookies', () => {
  const counts = Object.fromEntries(landingArms.map(arm => [arm, 0]))
  for (let i = 0; i < 256; i++) {
    const assignment = createLandingAssignment(`00000000-0000-4000-8000-0000000000${i.toString(16).padStart(2, '0')}`)
    counts[assignment.arm]++
    expect(parseLandingAssignment(serializeLandingAssignment(assignment))).toEqual(assignment)
    const properties = landingProperties(assignment)
    expect(properties.experiment_id).toBe('landing_homepage_v2')
    expect(properties.landing_version).toBe('2')
    expect(properties.variant).toBe(assignment.arm.endsWith('_b') ? 'b' : 'a')
  }
  expect(Object.values(counts)).toEqual([128, 128])
})
test('rejects stale or malformed assignments without attaching experiment attribution', () => {
  for (const cookie of [undefined, '', 'malformed.hero_a', '00000000-0000-4000-8000-000000000001.old_arm', '00000000-0000-4000-8000-000000000001.hero_a.extra']) {
    expect(parseLandingAssignment(cookie)).toBeNull()
  }
  expect(landingProperties(null)).toEqual({})
  expect(readLandingCookie('other=value; mogging_landing_v1=00000000-0000-4000-8000-000000000001.hero_b')?.arm).toBe('hero_b')
})
test('intervals preserve uncertainty in empty, zero-conversion, and small cohorts', () => {
  expect(landingRateInterval(0, 0)).toBeNull()
  const zero = landingRateInterval(0, 10)!
  expect(zero[0]).toBeCloseTo(0)
  expect(zero[1]).toBeGreaterThan(30)
  const small = landingRateInterval(1, 10)!
  const large = landingRateInterval(100, 1000)!
  expect(small[1] - small[0]).toBeGreaterThan(large[1] - large[0])
})
test('reporting includes unobserved variants and separates pending from mature conversion rates', () => {
  const rows = landingExperimentRows([{ experiment_id: 'landing_hero_v1', variant: 'b', visitors: 20, store_clicks: 6, mature: 10, mature_store_clicks: 2, pending: 10, web_starts: 1, paid_checkouts: 1 }], 'landing_hero_v1')
  expect(rows[0]).toMatchObject({ visitors: 0, observed_store_rate: '—', interval: '—' })
  expect(rows[1]).toMatchObject({ visitors: 20, observed_store_rate: '30.0%', mature_store_rate: '20.0%', pending: 10, paid_checkouts: 1 })
})

test('new assignments take precedence while historical Stripe metadata stays readable', () => {
  const legacy = parseLandingAssignment('00000000-0000-4000-8000-000000000001.hero_b')!
  const active = createLandingAssignment('00000000-0000-4000-8000-000000000002')
  expect(isActiveLandingAssignment(legacy)).toBe(false)
  expect(isActiveLandingAssignment(active)).toBe(true)
  expect(landingProperties(legacy)).toMatchObject({experiment_id:'landing_hero_v1',landing_version:'1',variant:'b'})
  expect(readLandingCookie(`mogging_landing_v1=${serializeLandingAssignment(legacy)}; mogging_landing_v2=${serializeLandingAssignment(active)}`)).toEqual(active)
  expect(landingExperiments.filter(item=>item.status==='active').map(item=>item.id)).toEqual(['landing_homepage_v2'])
})
test('no observations or immature cohorts produce no lift or winner', () => {
  const empty = landingExperimentSummary([], 'landing_homepage_v2', new Date('2026-10-05'))
  expect(empty).toMatchObject({status:'Awaiting first exposure', lift:'—', total:0})
  const recent = ['a','b'].map(variant=>({experiment_id:'landing_homepage_v2',variant,visitors:20,mature:0,mature_store_clicks:0,first_exposure:'2026-10-04'}))
  expect(landingExperimentSummary(recent,'landing_homepage_v2',new Date('2026-10-05'))).toMatchObject({status:'Collecting data',difference:'Awaiting mature visitors',lift:'—'})
})
test('allocation warnings take precedence over large apparent improvements', () => {
  const rows = ['a','b'].map((variant,i)=>({experiment_id:'landing_homepage_v2',variant,visitors:i?2000:1000,mature:i?2000:1000,mature_store_clicks:i?1000:100,first_exposure:'2026-09-01'}))
  expect(landingExperimentSummary(rows,'landing_homepage_v2',new Date('2026-10-05'))).toMatchObject({status:'Check traffic allocation',imbalance:true})
})
test('balanced mature cohorts expose effect size without declaring a winner', () => {
  const rows = ['a','b'].map((variant,i)=>({experiment_id:'landing_homepage_v2',variant,visitors:1000,mature:1000,mature_store_clicks:i?250:200,first_exposure:'2026-09-01'}))
  expect(landingExperimentSummary(rows,'landing_homepage_v2',new Date('2026-10-05'))).toMatchObject({status:'Checkpoints met · review uncertainty',difference:'5.0 percentage points',lift:'25.0%',imbalance:false})
})
