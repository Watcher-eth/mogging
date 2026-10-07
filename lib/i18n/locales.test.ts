import { describe, expect, test } from 'bun:test'
import { resolveLocale } from './locales'
import { createInstance } from 'i18next'
import { resources } from './catalogs'

describe('regional language selection', () => {
  test.each([
    ['de-DE', 'de'], ['de-AT', 'de-AT'], ['de-CH', 'de-CH'], ['de-LI', 'de'],
    ['es-ES', 'es'], ['es-MX', 'es-419'], ['es-AR', 'es-419'], ['es-419', 'es-419'],
    ['fr-CA', 'fr'], ['fr-BE', 'fr'], ['fr-CH', 'fr'], ['fr-SN', 'fr'],
    ['zh-CN', 'zh-Hans'], ['zh-SG', 'zh-Hans'], ['zh-Hans-HK', 'zh-Hans'],
    ['zh-TW', 'en'], ['zh-HK', 'en'], ['zh-Hant-CN', 'en'],
  ] as const)('%s chooses %s without losing regional formatting', (tag, language) => {
    expect(resolveLocale([tag])).toEqual({ language, formatLocale: Intl.getCanonicalLocales(tag)[0] })
  })
  test('ordered preferences, malformed tags and underscore normalization', () => {
    expect(resolveLocale(['not valid', 'ja-JP', 'fr_CA'])).toEqual({ language: 'fr', formatLocale: 'fr-CA' })
    expect(resolveLocale(['en-GB', 'de-CH']).language).toBe('en')
    expect(resolveLocale([]).language).toBe('en')
  })
})

test('SSR language instances do not bleed across concurrent renders', async () => {
  const instance = (lng: string) => {
    const i18n = createInstance()
    void i18n.init({ resources, lng, fallbackLng: 'en', keySeparator: false, initAsync: false })
    return i18n
  }
  const german = instance('de-CH')
  const french = instance('fr')
  await french.changeLanguage('es-419')
  expect(german.t('close')).toBe('Schliessen')
  expect(french.t('settings.title')).toBe('Configuración')
  expect(german.t('settings.title')).toBe('Einstellungen')
})

test('regional overrides preserve shared translations and community terms', () => {
  expect(resources['de-AT'].translation).toEqual(resources.de.translation)
  expect(resources['de-CH'].translation.close).toBe('Schliessen')
  expect(resources['es-419'].translation['landing.title']).toBe(resources.es.translation['landing.title'])
  for (const resource of Object.values(resources)) expect(resource.translation['nav.battle']).toBe('Battle')
})
