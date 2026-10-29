import { useState } from 'react'
import Link from 'next/link'
import { useReducedMotion } from 'motion/react'
import * as m from 'motion/react-m'
import { ArrowUpRight } from 'lucide-react'
import { GuidePage, GuideSection, GuideQuestions } from '@/components/app/guide-page'
import { ProgressPreview } from '@/components/landing/mobile-preview'
import styles from '@/components/app/guide-page.module.css'

const forms = [
  { word: 'mog', kind: 'verb', meaning: 'To outshine or stand out in a comparison.', example: '“That jacket mogs the rest of my wardrobe.”' },
  { word: 'mogging', kind: 'the action', meaning: 'Outshining someone or something else.', example: '“The drummer is mogging the whole band tonight.”' },
  { word: 'mogged', kind: 'past tense', meaning: 'Outshone, according to the person making the comparison.', example: '“My old setup got mogged by this new one.”' },
]

export default function MoggingMeaningPage() {
  return <GuidePage title="What is mogging? Meaning, origin, and examples" description="What mogging means, how mog and mogged are used, where the slang comes from, and how the Mogging app helps you understand your own features and build a routine." path="/what-is-mogging" eyebrow="WHAT IS MOGGING?" heading={<>Mogging,<br />explained.</>} intro="Mogging is internet slang for outshining someone—often in appearance, but also in style, performance or presence. It’s a comparison, not a measurement." visual={<WordForms />} chapters={[{ id: 'the-meaning', label: 'The meaning' }, { id: 'the-app', label: 'The app' }, { id: 'the-origin', label: 'The origin' }, { id: 'questions', label: 'Questions' }]}>
    <GuideSection id="the-meaning" eyebrow="THE LANGUAGE" title={<>The context<br />changes the meaning.</>}>
      <p className={styles.body}>Online, the word can be playful, admiring or self-deprecating. In an appearance comparison it describes someone’s impression of a face, physique, hairstyle or outfit. Outside that context, it can simply mean doing something much better.</p><div className={styles.compare}><div><h3>Mogging</h3><p>A comparison: someone or something stands out. The judgment comes from the person using the word.</p></div><div><h3>Looksmaxxing</h3><p>An activity: trying to improve your own appearance. The words often appear together, but describe different things.</p></div></div><p className={styles.fine}>A meme, a personal preference and an app-generated score are different kinds of information. None is a factual ranking of people.</p>
    </GuideSection>
    <GuideSection id="the-app" eyebrow="MOGGING, THE APP" title={<>Put the focus<br />on your own progress.</>}>
      <div className={styles.grid}><div><p className={styles.body}>Mogging is also our face analysis app. Start with your own features, understand the report, and turn your findings into a routine you can keep.</p><div className={styles.flow}><div><span>01</span><div><h3>Understand your starting point.</h3><p>Explore your evaluation across eyes, brows, skin, jaw, proportions and more.</p></div></div><div><span>02</span><div><h3>Build a daily rhythm.</h3><p>Your personalized Protocol brings recommendations into practical daily steps.</p></div></div><div><span>03</span><div><h3>Revisit with context.</h3><p>Keep consistent photos and compare your saved evaluations over time.</p></div></div></div><Link className={styles.textLink} href="/how-face-analysis-works">See how the analysis works <ArrowUpRight size={15} /></Link></div><div className={styles.heroVisual}><ProgressPreview /></div></div><p className={styles.fine}>Example app data. Photo-based assessments and potential scores are estimates, not guaranteed outcomes.</p>
    </GuideSection>
    <GuideSection id="the-origin" eyebrow="A SHORT HISTORY" title="From forum slang to your feed.">
      <p className={styles.body}>Merriam-Webster traces “mog” to the abbreviation AMOG, used in male internet communities. The term later spread into broader, often humorous social media usage.</p><div className={styles.history}><div><span>EARLY 2000s</span><h3>AMOG</h3><p>The abbreviation “alpha male of the group” appears in online communities.</p></div><div><span>BY 2016</span><h3>Mog</h3><p>The shorter verb is documented in internet forums.</p></div><div><span>2020s</span><h3>Mogging</h3><p>Memes and social media broaden its use beyond appearance comparisons.</p></div></div><a className={styles.source} href="https://www.merriam-webster.com/slang/mog" target="_blank" rel="noreferrer">Source: Merriam-Webster’s slang entry <ArrowUpRight size={12} /></a>
    </GuideSection>
    <GuideSection id="questions" eyebrow="QUICK ANSWERS" title="The questions behind the word.">
      <GuideQuestions items={[
        { question: 'Is mogging a compliment or an insult?', answer: 'It depends on the context. It can praise someone’s style or performance, or make a self-deprecating joke. It can also put down the person being compared.' },
        { question: 'Is mogging only about men?', answer: 'No. Although its roots are in male internet communities, people now use it for other people, outfits, skills and even objects.' },
        { question: 'What does hairmogging or jawmogging mean?', answer: 'The extra word names the feature being compared—hair or jaw appearance, for example. These are subjective slang terms, even when they sound technical.' },
        { question: 'What is a mog battle?', answer: 'A comparison framed as a contest, often using two photos or people in a video. The result reflects preferences and presentation, not an objective verdict about a person.' },
        { question: 'Is the Mogging app the same as the slang?', answer: 'They share a name. The app provides face analysis reports, personalized routines and progress tracking. The slang describes a comparison made by a person.' },
      ]} />
    </GuideSection>
  </GuidePage>
}

function WordForms() {
  const [selected, setSelected] = useState(0), reduced = useReducedMotion(), form = forms[selected]
  return <div className={styles.wordDemo}><div className={styles.tabs} role="group" aria-label="Explore word forms">{forms.map((item, index) => <button key={item.word} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}>{item.word}</button>)}</div><m.div key={form.word} initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .25, ease: [.16,1,.3,1] }}><p className={styles.bigWord}>{form.word}</p><span className={styles.wordKind}>{form.kind}</span><p className={styles.wordMeaning}>{form.meaning}</p><p className={styles.wordExample}>{form.example}</p></m.div></div>
}
