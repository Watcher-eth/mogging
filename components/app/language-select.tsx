import { useRouter } from 'next/router'
import { useTranslation } from 'react-i18next'
import * as Select from '@radix-ui/react-select'
import { locales, localeNames, type Locale } from '@/lib/i18n/locales'

const localeFlags: Record<Locale, string> = { en: '🇺🇸', de: '🇩🇪', 'de-AT': '🇦🇹', 'de-CH': '🇨🇭', es: '🇪🇸', 'es-419': '🇲🇽', fr: '🇫🇷', 'zh-Hans': '🇨🇳' }

export function LanguageSelect() {
  const router = useRouter()
  const { t } = useTranslation()
  const current = (router.locale ?? 'en') as Locale

  async function changeLanguage(value: string) {
    const locale = value as Locale
    const changed = await router.push({ pathname: router.pathname, query: router.query }, router.asPath, { locale })
    if (changed) document.cookie = `NEXT_LOCALE=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  }

  return <Select.Root value={current} onValueChange={value => void changeLanguage(value)}>
    <Select.Trigger
      aria-label={`${t('language')}: ${localeNames[current]}`}
      title={localeNames[current]}
      className="flex h-8 w-9 items-center justify-center rounded-md border-0 bg-transparent text-lg outline-none hover:bg-zinc-100 focus-visible:bg-zinc-100 data-[state=open]:bg-zinc-100 sm:h-10 sm:w-10"
    >
      <Select.Value><span aria-hidden="true">{localeFlags[current]}</span></Select.Value>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content position="popper" align="start" sideOffset={4} className="z-50 rounded-md border-0 bg-white p-1 shadow-lg outline-none">
        <Select.Viewport>
          {locales.map(locale => <Select.Item key={locale} value={locale} title={localeNames[locale]} aria-label={localeNames[locale]} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-lg outline-none data-[highlighted]:bg-zinc-100 data-[state=checked]:bg-zinc-100">
            <Select.ItemText><span aria-hidden="true">{localeFlags[locale]}</span><span className="sr-only">{localeNames[locale]}</span></Select.ItemText>
          </Select.Item>)}
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>
}
