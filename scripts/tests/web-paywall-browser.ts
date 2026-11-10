import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { createHmac, randomUUID } from 'node:crypto'
import { chromium, devices, webkit, type Browser } from 'playwright-core'
import type { PaywallExposure, PaywallSurface } from '../../lib/payments/paywall-experiment'

const origin = new URL(process.env.WEB_PAYWALL_TEST_ORIGIN ?? 'http://127.0.0.1:3393')
assert(['127.0.0.1', 'localhost'].includes(origin.hostname), 'Use a local development server')
const front = resolve('public/analysis/studio/pair-front.jpg')
const side = resolve('public/analysis/studio/pair-side.jpg')
const engine = process.env.WEB_PAYWALL_BROWSER === 'webkit' ? webkit : chromium
const browser = await engine.launch({ executablePath: process.env.WEB_PAYWALL_BROWSER_EXECUTABLE })

async function testPaywall(browser: Browser, surface: PaywallSurface, arm: PaywallExposure['arm']) {
  const mobile = surface === 'mobile'
  const context = await browser.newContext(mobile ? devices['iPhone 15'] : { viewport: { width: 1440, height: 950 } })
  const page = await context.newPage()
  page.setDefaultTimeout(45_000)
  const treatment = arm === 'treatment'
  const experiment: PaywallExposure = {
    id: mobile ? 'mobile_length_fixture' : 'desktop_price_fixture',
    unit: (treatment ? 'a' : 'b').repeat(32), arm, surface,
    kind: mobile ? 'length' : 'price', endsAt: Date.now() + 86_400_000, minimumPerArm: 500,
  }
  const amount = mobile ? 1499 : treatment ? 1599 : 1799
  const product = 'web_basic_monthly'
  const checkoutRequests: Array<Record<string, unknown>> = []
  let catalogRequests = 0
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin.origin) return route.abort()
      if (url.pathname === '/api/auth/session') return route.fulfill({ json: {} })
      if (url.pathname === '/api/payments/subscription-prices') {
        assert.equal(url.searchParams.get('experiment'), surface)
        assert.equal(url.searchParams.get('catalog'), mobile ? 'web-analysis-mobile' : 'web-analysis')
        catalogRequests++
        const amounts = mobile
          ? { web_basic_weekly: 699, web_basic_monthly: amount, web_pro_monthly: 1999 }
          : { web_basic_weekly: 899, web_basic_monthly: amount, web_pro_monthly: 2999 }
        return route.fulfill({ json: { data: { currency: 'usd', amounts, experiment } } })
      }
      if (url.pathname === '/api/payments/report-price') {
        return route.fulfill({ json: { data: { product: 'evaluation', currency: 'usd', amount: 599 } } })
      }
      if (url.pathname === '/api/payments/web-checkout') {
        checkoutRequests.push(route.request().postDataJSON())
        if (checkoutRequests.length === 1) {
          return route.fulfill({ status: 409, json: { error: { message: 'The price has changed. Please reload the plans' } } })
        }
        return route.fulfill({ json: { data: { url: new URL('/fixture-stripe', origin).href, sessionId: 'cs_test_fixture' } } })
      }
      if (url.pathname === '/fixture-stripe') return route.fulfill({ body: 'Hosted checkout fixture' })
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: { error: { message: 'Endpoint outside browser fixture' } } })
      return route.continue()
    })

    await page.goto(new URL('/analysis?start=1&from=app', origin).href, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: mobile ? 'Open camera' : 'Choose front photo' }).first().waitFor()
    await page.locator('input[type=file]').first().setInputFiles(front)
    if (mobile) {
      await page.getByRole('button', { name: 'Use photo', exact: true }).click()
      await page.getByRole('button', { name: /unlock.*(report|evaluation)/i }).click()
    } else {
      await page.getByRole('heading', { name: 'Add a side profile.' }).waitFor()
      await page.locator('input[type=file]').nth(1).setInputFiles(side)
      await page.getByRole('checkbox', { name: /I agree to photo processing/i }).check()
      await page.getByRole('button', { name: 'Scan my photos', exact: true }).click()
    }

    const dialog = page.locator(mobile ? '[data-scan-fullscreen][role=dialog]' : '[data-desktop-analysis][role=dialog]')
    const cta = dialog.getByRole('button', { name: /unlock now/i })
    await cta.waitFor()
    const expected = '$' + (amount / 100).toFixed(2)
    await dialog.getByText(expected, { exact: true }).first().waitFor()
    assert.equal(await dialog.getAttribute('data-paywall-length'), mobile && treatment ? 'short' : null)
    assert.match(await dialog.innerText(), /month/i)
    await cta.click()
    const alert = dialog.getByRole('alert').filter({ hasText: 'The price has changed' })
    await alert.waitFor()
    const beforeRetry = catalogRequests
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/payments/subscription-prices'),
      alert.getByRole('button', { name: /try again|retry/i }).click(),
    ])
    assert(catalogRequests > beforeRetry, 'Retry refreshes the displayed catalog')
    await cta.click()
    await page.waitForURL('**/fixture-stripe')
    assert.equal(checkoutRequests.length, 2)
    for (const request of checkoutRequests) {
      assert.equal(request.product, product)
      assert.equal(request.webPriceVariant, mobile ? 'mobile' : undefined)
      assert.equal(request.unitAmount, amount)
      assert.equal(request.paywallExperimentId, experiment.id)
      assert.equal(request.paywallExperimentUnit, experiment.unit)
    }
    assert.deepEqual(errors, [])
    console.log(`PASS: ${surface} ${arm} upload → preview → quoted paywall → stale price retry → hosted checkout fixture`)
  } catch (error) {
    const state = await page.locator('body').innerText({ timeout: 2000 }).catch(() => '')
    throw new Error(`${surface} ${arm}\n${state.slice(0, 800)}\nBrowser errors: ${errors.join(' | ')}`, { cause: error })
  } finally {
    await context.close()
  }
}

async function testOnboarding(surface: PaywallSurface, arm: PaywallExposure['arm']) {
  const short = arm === 'treatment'
  const mobile = surface === 'mobile'
  const experimentId = process.env.WEB_ONBOARDING_TEST_ID!
  const secret = process.env.NEXTAUTH_SECRET
  assert(secret, 'Provide the local server signing secret')
  const context = await browser.newContext(mobile ? devices['iPhone 15'] : { viewport: { width: 1440, height: 950 } })
  let visitor: string
  do {
    visitor = randomUUID()
  } while (createHmac('sha256', secret).update(`mogging:paywall:${experimentId}:${surface}:${visitor}`).digest()[0] % 2 !== Number(short))
  await context.addCookies([{ name: 'mogging_paywall_visitor', value: visitor, url: origin.origin }])
  const page = await context.newPage()
  page.setDefaultTimeout(20_000)
  try {
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin.origin) return route.abort()
      if (url.pathname === '/api/auth/session') return route.fulfill({ json: {} })
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: { error: { message: 'Endpoint outside browser fixture' } } })
      return route.continue()
    })
    await page.goto(new URL('/analysis?start=1', origin).href, { waitUntil: 'domcontentloaded' })
    if (mobile) {
      await page.getByRole('button', { name: 'I’m ready to Mog' }).click()
      const steps = ['impressions', 'dating', 'motivation', 'relevance', 'agency', 'transformation', 'mechanism', 'goals',
        ...(short ? [] : ['obstacle', 'experience']), 'evidence', 'age', 'gender', ...(short ? [] : ['time']), 'commit']
      for (const step of steps) {
        const panel = page.locator(`[data-mobile-onboarding-step="${step}"]`)
        await panel.waitFor()
        if (['motivation', 'goals', 'obstacle'].includes(step)) await panel.getByRole('group').getByRole('button').first().click()
        await panel.getByRole('button', { name: /^(continue|personalize my plan|find my starting point|i’m ready to invest in myself|let’s go)$/i }).click()
      }
      await page.getByRole('button', { name: 'Open camera' }).waitFor()
    } else {
      const steps = [...(short ? [] : ['ethnicity']), 'profile', 'age', 'focus', 'recap', ...(short ? [] : ['privacy'])]
      for (const step of steps) {
        const panel = page.locator(`[data-onboarding-step="${step}"]`)
        await panel.waitFor()
        if (step === 'profile' || step === 'focus') await panel.getByRole('group').getByRole('button').first().click()
        const next = panel.locator('.desktop-onboarding-continue')
        if (step === 'privacy') {
          assert(await next.isDisabled())
          await panel.getByRole('checkbox', { name: /I agree to photo processing/i }).check()
        }
        await next.click()
      }
      await page.getByRole('button', { name: 'Choose front photo' }).waitFor()
      if (short) {
        await page.locator('input[type=file]').first().setInputFiles(front)
        await page.getByRole('heading', { name: 'Add a side profile.' }).waitFor()
        await page.locator('input[type=file]').nth(1).setInputFiles(side)
        await page.getByText(/By selecting Agree and scan my photos/).waitFor()
        await page.getByRole('button', { name: 'Agree and scan my photos' }).click()
        await page.getByRole('heading', { name: 'Your Report' }).waitFor({ timeout: 45_000 })
      }
    }
    console.log(`PASS: ${surface} ${arm} onboarding reaches capture with the expected steps and consent`)
  } catch (error) {
    const state = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '')
    throw new Error(`${surface} ${arm} onboarding: ${state.slice(0, 600)}`, { cause: error })
  } finally {
    await context.close()
  }
}

try {
  const cases = (['mobile', 'desktop'] as const).flatMap(surface => (['control', 'treatment'] as const).map(arm =>
    process.env.WEB_ONBOARDING_TEST_ID ? testOnboarding(surface, arm) : testPaywall(browser, surface, arm),
  ))
  const results = await Promise.allSettled(cases)
  const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
  if (errors.length) throw new AggregateError(errors, 'Web analysis browser checks failed')
} finally {
  await browser.close()
}
