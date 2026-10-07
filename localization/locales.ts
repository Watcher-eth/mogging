export const locales = ['en', 'de', 'de-AT', 'de-CH', 'es', 'es-419', 'fr', 'zh-Hans'] as const
export type Locale = typeof locales[number]
export const localeNames: Record<Locale, string> = {
  en: 'English', de: 'Deutsch (Deutschland)', 'de-AT': 'Deutsch (Österreich)',
  'de-CH': 'Deutsch (Schweiz)', es: 'Español (España)', 'es-419': 'Español (Latinoamérica)',
  fr: 'Français', 'zh-Hans': '简体中文',
}

// Wording and formatting are separate: preserve fr-CA, es-MX, de-AT, etc.
export function resolveLocale(preferences: readonly string[]): { language: Locale; formatLocale: string } {
  for (const preference of preferences) {
    let tag: string
    try { tag = Intl.getCanonicalLocales(preference.replaceAll('_', '-'))[0] } catch { continue }
    if (!tag) continue
    const [language, ...subtags] = tag.split('-')
    const region = subtags.find(part => /^[A-Z]{2}$|^\d{3}$/.test(part))
    const explicitScript = subtags.find(part => /^[A-Z][a-z]{3}$/.test(part))
    if (language === 'de') return { language: region === 'CH' ? 'de-CH' : region === 'AT' ? 'de-AT' : 'de', formatLocale: tag }
    if (language === 'es') return { language: !region || region === 'ES' ? 'es' : latinAmerica.has(region) ? 'es-419' : 'es', formatLocale: tag }
    if (language === 'fr') return { language: 'fr', formatLocale: tag }
    if (language === 'zh') {
      // Script takes precedence over region; Traditional Chinese is not translated yet.
      const script = explicitScript ?? (['TW', 'HK', 'MO'].includes(region ?? '') ? 'Hant' : 'Hans')
      if (script === 'Hans') return { language: 'zh-Hans', formatLocale: tag }
      return { language: 'en', formatLocale: tag }
    }
    if (language === 'en') return { language: 'en', formatLocale: tag }
  }
  return { language: 'en', formatLocale: 'en' }
}
const latinAmerica = new Set(['419', 'AR', 'BO', 'BR', 'BZ', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'GT', 'HN', 'MX', 'NI', 'PA', 'PE', 'PR', 'PY', 'SV', 'UY', 'VE'])
