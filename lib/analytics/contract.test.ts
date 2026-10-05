import { expect, test } from 'bun:test'
import { sanitizeProperties } from './contract'
const mobileContract = Bun.file(new URL('../../../mogging-mobile/src/analytics/contract.ts', import.meta.url))
test.skipIf(!await mobileContract.exists())('web and mobile deployment contracts stay identical', async () => {
  expect(await Bun.file(new URL('./contract.ts', import.meta.url)).text()).toBe(await mobileContract.text())
})
test('property budget bounds batch payload size even for multibyte input', () => {
  const value = '🧪'.repeat(160)
  const props = sanitizeProperties(Object.fromEntries(['screen','previous_screen','step','flow_id','attempt_id','surface','plan','product','productId','product_id','offering','paywall_id','paywall_version','default_plan','channel','provider','status','path','referrer_host'].map(key => [key, value])))
  expect(new TextEncoder().encode(JSON.stringify(props)).byteLength).toBeLessThan(2100)
})

const mobileOnboarding = Bun.file(new URL('../../../mogging-mobile/src/analytics/onboarding.ts', import.meta.url))
test.skipIf(!await mobileOnboarding.exists())('admin and mobile onboarding catalogs stay identical', async () => {
  expect(await Bun.file(new URL('./onboarding.ts', import.meta.url)).text()).toBe(await mobileOnboarding.text())
})
