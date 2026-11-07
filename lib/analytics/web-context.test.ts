import { expect, test } from 'bun:test'
import { WEB_FLOW_VERSION, webFlowContext, webRequestContext } from './web-context'
import { sanitizeProperties } from './contract'

test('in-app browser context survives the event contract without retaining user agents', () => {
  const fields = { ...webRequestContext('Mozilla/5.0 (iPhone) AppleWebKit Safari musical_ly'), ...webFlowContext('/analysis','?start=1&email=private') }
  expect(sanitizeProperties(fields)).toEqual({ device_platform: 'ios', browser_family: 'tiktok', flow_version: WEB_FLOW_VERSION, entry_mode: 'photo_first' })
  expect(webFlowContext('/analysis','')).toMatchObject({ entry_mode: 'onboarding_first' })
  expect(webFlowContext('/','?start=1')).toEqual({})
})
