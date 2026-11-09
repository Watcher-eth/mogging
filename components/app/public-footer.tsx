import Link from 'next/link'
import { useTranslation } from 'react-i18next'

const resources = [
  ['/what-is-mogging', 'footer.what'],
  ['/how-face-analysis-works', 'footer.how'],
  ['/faq', 'footer.faq'],
  ['/support', 'footer.support'],
  ['/privacy', 'footer.privacy'],
  ['/tos', 'footer.terms'],
] as const

export function FooterLinks({ className }: { className?: string }) {
  const { t } = useTranslation()
  return <nav aria-label={t('footer.resources')} className={className}>
    {resources.map(([href, label]) => (
      <Link key={href} href={href} prefetch={false} className="hover:text-black">{t(label)}</Link>
    ))}
  </nav>
}

export function PublicFooter() {
  return <footer className="border-t border-zinc-200 bg-white py-8 text-sm text-zinc-600">
    <FooterLinks className="public-frame public-gutters flex flex-wrap gap-x-6 gap-y-4" />
  </footer>
}
