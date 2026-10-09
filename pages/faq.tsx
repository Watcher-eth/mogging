import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowUpRight, Plus, MessageCircle } from 'lucide-react'
import { LazyMotion, domAnimation, useReducedMotion } from 'motion/react'
import * as m from 'motion/react-m'
import { SeoHead } from '@/components/app/seo-head'
import styles from '@/components/app/faq.module.css'

const groups = [
  { id: 'getting-started', title: 'Getting started', questions: [
    { id: 'what-is-mogging', question: 'What does the Mogging app do?', answer: 'Mogging turns a face photo into a detailed feature report. The app brings your evaluations, personalized Protocol and report history together, so you can understand your features and build a daily routine.', link: { href: '/', label: 'Explore the app' } },
    { id: 'free', question: 'Is Mogging free to download?', answer: 'Yes. Downloading the iPhone app is free. Evaluations and Pro features require a purchase. You can review the available plans before paying.' },
    { id: 'devices', question: 'Can I use Mogging without an iPhone?', answer: 'You can start a paid face analysis in your browser. The mobile app is available for iPhone, with an Android app coming soon.', link: { href: '/analysis', label: 'Try web analysis' } },
    { id: 'photo', question: 'What makes a good scan photo?', answer: 'Use a clear, front-facing photo with even lighting and a relaxed expression. Keep the face unobstructed, avoid beauty filters and extreme angles, and use the original image rather than a low-resolution screenshot.' },
  ] },
  { id: 'reports', title: 'Your report', questions: [
    { id: 'included', question: 'What does my evaluation include?', answer: 'The updated report covers 13 categories and 110+ feature metrics, including eyes, brows, nose, mouth, jaw, cheeks, face shape, proportions, symmetry, skin, hair, ears and Overall. You also get personalized recommendations and saved evaluations. Older app versions and saved reports may use the previous report format.' },
    { id: 'scores', question: 'How should I read my scores?', answer: 'Read the feature descriptions and annotations alongside the numbers. Mogging Score and feature scores use a ten-point scale; PSL uses an eight-point scale. A photo-based score is an estimate influenced by lighting, pose and image quality, not an objective measure of your worth or a medical diagnosis.', link: { href: '/how-face-analysis-works', label: 'How face analysis works' } },
    { id: 'variation', question: 'Why do my results change between photos?', answer: 'Lighting, camera distance, head position, expression and filters change what is visible in a photo. The analysis itself can also vary. Keep your capture conditions consistent and compare the images and feature descriptions before interpreting a score change as physical progress.' },
    { id: 'measurements', question: 'How are feature measurements calculated?', answer: 'The analysis uses detected facial landmarks and image-based assessment to describe visible proportions, angles and features. The report combines geometry with visual context. Measurements describe the photograph; they are not a clinical examination or precise real-world anatomical measurements.' },
  ] },
  { id: 'protocol', title: 'Your Protocol', questions: [
    { id: 'daily-plan', question: 'What is a Protocol?', answer: 'Your Protocol turns your evaluation into personalized daily steps for areas such as skin care, grooming and posture. It brings your recommendations into a routine you can follow and mark complete.' },
    { id: 'progress', question: 'How do I track progress?', answer: 'Complete your daily tasks and keep your saved evaluations. When you take another photo, use similar lighting, camera distance, pose and expression so your reports are easier to compare.' },
    { id: 'potential', question: 'What does the potential score mean?', answer: 'Potential is an estimate of how your appearance could develop with the suggested improvements. It helps you prioritize your plan; it is not a promise of a particular score or outcome.' },
  ] },
  { id: 'privacy', title: 'Privacy & sharing', questions: [
    { id: 'leaderboard', question: 'Will my photos appear on the leaderboard?', answer: 'Joining the leaderboard is optional. You choose whether to make your profile public, and you can change that choice in Settings.' },
    { id: 'data', question: 'Where can I learn how my data is handled?', answer: 'Our privacy policy explains how Mogging handles account information, photos and service data. Contact support if you have a question about a report, photo visibility or a shared link.', link: { href: '/privacy', label: 'Read the privacy policy' } },
    { id: 'delete', question: 'How can I request data or account deletion?', answer: 'Email support@mogging.app with the subject “Privacy Request” and include the email on your account and any relevant profile or report links. Support can help with account data, photo visibility, sharing and deletion requests.', link: { href: '/support#privacy', label: 'Privacy support' } },
  ] },
  { id: 'billing', title: 'Billing & support', questions: [
    { id: 'access', question: 'I paid, but my access has not unlocked. What should I do?', answer: 'Confirm you are signed into the account you used for the purchase. If access is still missing, contact support with your checkout email, receipt details and approximate purchase time.', link: { href: '/support#billing', label: 'Get billing help' } },
    { id: 'refund', question: 'How do I get help with billing or a refund?', answer: 'Contact support with your account email and purchase details. The team can help you identify the purchase provider and the right next step for your request.', link: { href: '/support#billing', label: 'Billing and refunds' } },
    { id: 'signin', question: 'I cannot sign in. Where can I get help?', answer: 'First check that you are using the same login method you used to create your account. If that does not resolve it, email support@mogging.app with your account email and a short description of what happened.', link: { href: '/support', label: 'Contact support' } },
  ] },
]

export default function FaqPage() {
  const [open, setOpen] = useState<string | null>(null)
  const [active, setActive] = useState(groups[0].id)
  const reduced = useReducedMotion()
  useEffect(() => {
    const sections = groups.map(group => document.getElementById(group.id)).filter((section): section is HTMLElement => Boolean(section))
    const observer = new IntersectionObserver(entries => {
      const visible = entries.find(entry => entry.isIntersecting)
      if (visible) setActive(visible.target.id)
    }, { rootMargin: '-110px 0px -65% 0px' })
    sections.forEach(section => observer.observe(section))
    return () => observer.disconnect()
  }, [])
  const entrance = { initial: { opacity: reduced ? 1 : 0, y: reduced ? 0 : 12 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .1 }, transition: { duration: reduced ? 0 : .35, ease: [.16, 1, .3, 1] as [number, number, number, number] } }
  return <LazyMotion features={domAnimation}>
    <SeoHead title="FAQ | Mogging" description="Answers about Mogging face analysis, reports, your Protocol, privacy, billing and support." path="/faq" />
    <div className={styles.page} data-faq-page>
      <m.header {...entrance} className={styles.hero}><h1>FAQ</h1><p>Quick answers.<br />A clearer next step.</p></m.header>
      <div className={styles.layout}>
        <div className={styles.questions}>
          {groups.map(group => <m.section {...entrance} key={group.id} id={group.id} aria-labelledby={`${group.id}-title`} className={styles.group}>
            <h2 id={`${group.id}-title`}>{group.title}</h2>
            {group.questions.map(item => { const expanded = open === item.id; return <div key={item.id} className={styles.item} data-open={expanded}>
              <h3><button type="button" id={`${item.id}-trigger`} aria-expanded={expanded} aria-controls={`${item.id}-answer`} onClick={() => setOpen(current => current === item.id ? null : item.id)}><span>{item.question}</span><span className={styles.plus} aria-hidden="true"><Plus size={20} strokeWidth={1.5} /></span></button></h3>
              <div id={`${item.id}-answer`} role="region" aria-labelledby={`${item.id}-trigger`} aria-hidden={!expanded} inert={!expanded} className={styles.answer}><div><p>{item.answer}</p>{item.link ? <Link href={item.link.href}>{item.link.label}<ArrowUpRight size={15} /></Link> : null}</div></div>
            </div> })}
          </m.section>)}
        </div>
        <nav className={styles.index} aria-label="FAQ topics"><p>ON THIS PAGE</p>{groups.map(group => <a key={group.id} href={`#${group.id}`} aria-current={active === group.id ? 'location' : undefined} onClick={() => setActive(group.id)}>{group.title}</a>)}</nav>
      </div>
      <m.aside {...entrance} className={styles.support}><div><MessageCircle size={22} strokeWidth={1.5} /><h2>Still have a question?</h2><p>We’re here to help with your account, report or purchase.</p></div><Link href="/support">Get in touch<ArrowUpRight size={18} /></Link></m.aside>
    </div>
  </LazyMotion>
}
