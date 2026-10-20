import { expect, test } from 'bun:test'
import { sanitizeProperties } from './contract'
import { supportedOnboardingVersions, ONBOARDING_ANALYTICS_VERSION } from './onboarding'
const mobileContract = Bun.file(new URL('../../../mogging-mobile/src/analytics/contract.ts', import.meta.url))
test.skipIf(!await mobileContract.exists())('web and mobile deployment contracts stay identical', async () => {
  expect(await Bun.file(new URL('./contract.ts', import.meta.url)).text()).toBe(await mobileContract.text())
})
test('property budget bounds batch payload size even for multibyte input', () => {
  const value = '🧪'.repeat(160)
  const props = sanitizeProperties(Object.fromEntries(['screen','previous_screen','step','flow_id','attempt_id','surface','plan','product','productId','product_id','offering','paywall_id','paywall_version','default_plan','channel','provider','status','path','referrer_host'].map(key => [key, value])))
  expect(new TextEncoder().encode(JSON.stringify(props)).byteLength).toBeLessThan(2100)
})
test('required fields and scan correlation survive verbose attribution context without exporting unknown data', () => {
  const context = Object.fromEntries(['first_utm_source','first_utm_medium','first_utm_campaign','first_utm_content','first_utm_term','source','surface'].map(key => [key, 'x'.repeat(160)]))
  const props = sanitizeProperties({ ...context, evaluation_id: 'scan-one', request_id: 'mobile-v2:scan-one', report_id: 'report-one', step: 'upload', password: 'private', invalid: undefined })
  expect(props).toMatchObject({ evaluation_id: 'scan-one', request_id: 'mobile-v2:scan-one', report_id: 'report-one', step: 'upload' })
  expect(props).not.toHaveProperty('password')
})

const mobileOnboarding = Bun.file(new URL('../../../mogging-mobile/src/analytics/onboarding.ts', import.meta.url))
test('new onboarding analytics preserves supported released versions', () => {
  expect(supportedOnboardingVersions).toEqual(['3', '4', '5', ONBOARDING_ANALYTICS_VERSION])
})
test.skipIf(!await mobileOnboarding.exists())('admin and mobile onboarding catalogs stay identical', async () => {
  expect(await Bun.file(new URL('./onboarding.ts', import.meta.url)).text()).toBe(await mobileOnboarding.text())
})
