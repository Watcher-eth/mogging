import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { useMemo, type ReactNode } from 'react'
import { resources } from './catalogs'
import { locales, resolveLocale } from './locales'

export function LocalizationProvider({ locale, children }: { locale: string; children: ReactNode }) {
  // Every render tree owns its instance: concurrent SSR requests cannot share language.
  const instance = useMemo(() => {
    const i18n = createInstance()
    void i18n.init({
      resources, lng: resolveLocale([locale]).language, supportedLngs: [...locales],
      fallbackLng: 'en', keySeparator: false, initAsync: false,
      interpolation: { escapeValue: false }, react: { useSuspense: false },
    })
    return i18n
  }, [locale])
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>
}
