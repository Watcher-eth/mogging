import Link from 'next/link'
import type { ReactNode } from 'react'
import { LazyMotion, domAnimation, useReducedMotion } from 'motion/react'
import * as m from 'motion/react-m'
import { ArrowUpRight } from 'lucide-react'
import { SeoHead } from '@/components/app/seo-head'
import { appStoreUrl, canonicalUrl, siteUrl } from '@/lib/seo'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent, AccordionChevron } from '@/components/ui/accordion'
import styles from './guide-page.module.css'

function useEntrance() {
  const reduced = useReducedMotion()
  return { initial: { opacity: reduced ? 1 : 0, y: reduced ? 0 : 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .12 }, transition: { duration: reduced ? 0 : .55, ease: [.16, 1, .3, 1] as [number, number, number, number] } }
}

export function GuidePage({ title, description, path, eyebrow, heading, intro, visual, chapters, children }: {
  title: string; description: string; path: string; eyebrow: string; heading: ReactNode; intro: string; visual: ReactNode
  chapters: { id: string; label: string }[]; children: ReactNode
}) {
  const url = canonicalUrl(path), entrance = useEntrance()
  return <LazyMotion features={domAnimation}>
    <SeoHead title={`${title} | Mogging`} description={description} path={path} structuredData={{
      '@context': 'https://schema.org', '@graph': [
        { '@type': 'Article', '@id': `${url}#article`, headline: title, description, mainEntityOfPage: url, inLanguage: 'en', author: { '@type': 'Organization', name: 'Mogging', url: `${siteUrl}/` }, publisher: { '@type': 'Organization', name: 'Mogging', url: `${siteUrl}/` } },
        { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Mogging', item: `${siteUrl}/` }, { '@type': 'ListItem', position: 2, name: title, item: url }] },
      ],
    }} />
    <article className={styles.page}>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}><Link href="/">Mogging</Link><span>/</span><span>{eyebrow}</span></nav>
      <m.header {...entrance} className={styles.hero}><div className={styles.heroCopy}><p className={styles.eyebrow}>{eyebrow}</p><h1>{heading}</h1><p className={styles.lead}>{intro}</p><a className={styles.textLink} href={`#${chapters[0].id}`}>Take a closer look <ArrowUpRight size={15} /></a></div><div className={styles.heroVisual}>{visual}</div></m.header>
      <nav className={styles.chapters} aria-label="On this page">{chapters.map((chapter, index) => <a key={chapter.id} href={`#${chapter.id}`}><span>0{index + 1}</span>{chapter.label}</a>)}</nav>
      {children}
      <m.aside {...entrance} className={styles.end}><p className={styles.eyebrow}>YOUR NEXT STEP</p><h2>Get to know your face.<br />Build your own plan.</h2><div className={styles.links}><a className={styles.button} href={appStoreUrl}>Get Mogging for iPhone <ArrowUpRight size={15} /></a><Link className={styles.textLink} href="/analysis">Try web analysis <ArrowUpRight size={15} /></Link></div><p className={styles.fine}>Free to download. Evaluations and Pro features require a purchase.</p><Link className={styles.related} href={path === '/what-is-mogging' ? '/how-face-analysis-works' : '/what-is-mogging'}>{path === '/what-is-mogging' ? 'How the analysis works' : 'What is mogging?'} <ArrowUpRight size={14} /></Link></m.aside>
    </article>
  </LazyMotion>
}

export function GuideSection({ id, eyebrow, title, children, className = '' }: { id: string; eyebrow: string; title: ReactNode; children: ReactNode; className?: string }) {
  const entrance = useEntrance()
  return <m.section {...entrance} id={id} aria-labelledby={`${id}-title`} className={`${styles.section} ${className}`}><header className={styles.sectionHeading}><p className={styles.eyebrow}>{eyebrow}</p><h2 id={`${id}-title`}>{title}</h2></header>{children}</m.section>
}

export function GuideQuestions({ items }: { items: { question: string; answer: string }[] }) {
  return <Accordion className={styles.questions}>{items.map(item => <AccordionItem key={item.question} value={item.question} className={styles.question}><h3><AccordionTrigger><span>{item.question}</span><AccordionChevron /></AccordionTrigger></h3><AccordionContent className={styles.answer}><p>{item.answer}</p></AccordionContent></AccordionItem>)}</Accordion>
}
