import { ArrowRight, Check, ChevronLeft, ChevronRight, Play, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useState } from 'react'
import { courses, courseProgress, coursePublicationAge } from '@/lib/courses/originals'
import { ProgressiveBlur } from '@/components/courses/progressive-blur'

const names = ['Capture', 'Skin care', 'Grooming']
const artwork = (id: string) => `/scan/courses/${id}.jpg`

const face = 'M16 3C8 3 5 9 6 17L5 18L6 22L8 23C9 29 12 33 16 35C20 33 23 29 24 23L26 22L27 18L26 17C27 9 24 3 16 3Z'
function OriginalsMark() {
  const gradient = useId()
  return <span className="scan-originals-brand" aria-label="Mogging Originals">
    <svg width="32" height="32" viewBox="0 0 38 38" aria-hidden="true">
      <defs><linearGradient id={gradient} x2="100%" y2="100%"><stop stopColor="#f0f2f4" /><stop offset=".36" stopColor="#9aa4ae" /><stop offset=".76" stopColor="#25313d" /><stop offset="1" stopColor="#b8c0c7" /></linearGradient></defs>
      <path d={face} transform="translate(8 -1)" fill="#83909b" />
      <path d={face} fill={`url(#${gradient})`} stroke="#f7f8fa" strokeWidth=".9" />
      <path d="M9 16C8 9 11 6 16 6" fill="none" stroke="white" strokeWidth=".7" strokeLinecap="round" />
    </svg>
    <span><small>MOGGING</small><b>Originals</b></span>
  </span>
}

export default function ScanCourses({ userId }: { userId: string }) {
  const key = `mogging:originals:${userId}`
  const [completed, setCompleted] = useState<string[]>([])
  const [active, setActive] = useState(0)
  const [view, setView] = useState<'collection' | 'course' | number>('collection')
  const [choice, setChoice] = useState<number | null>(null)
  const [guide, setGuide] = useState(0)
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
      if (Array.isArray(saved)) setCompleted(saved.filter(value => typeof value === 'string'))
    } catch { /* Storage may be unavailable. */ }
  }, [key])
  const course = courses[active]
  const progress = courseProgress(course, completed)
  const lesson = typeof view === 'number' ? course.lessons[view] : null

  function open(index: number, target: 'collection' | 'course' | number) {
    setActive(index)
    setChoice(null)
    setGuide(0)
    setView(target)
    window.scrollTo(0, 0)
  }

  function finish() {
    if (!lesson || typeof view !== 'number') return
    const next = [...new Set([...completed, lesson.id])]
    setCompleted(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* Keep in-memory progress. */ }
    open(active, view + 1 < course.lessons.length ? view + 1 : 'course')
  }

  const lessonRows = course.lessons.map((item, index) => <button key={item.id} type="button" className="scan-course-lesson" onClick={() => open(active, index)}>
              <img src={artwork(item.id)} alt="" /><span><b>{item.title}</b><small>{item.intro}</small><small>{item.minutes} min</small></span>{completed.includes(item.id) ? <Check size={18} /> : <ChevronRight size={18} />}
            </button>)

  return <AnimatePresence mode="wait" initial={false}>
    <motion.section key={`${view}:${view === 'collection' ? '' : course.id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .24 }} className="scan-originals">
      {view === 'collection' ? <>
        <header><h1>Courses</h1><OriginalsMark /></header>
        <div className="scan-course-resume">
          {courses.map((item, index) => {
            const saved = courseProgress(item, completed)
            return <button key={item.id} type="button" onClick={() => open(index, Math.max(0, saved.next))}>
              <img src={artwork(`cover-${item.id}`)} alt="" /><span><b>{names[index]}</b><small>{saved.count ? `${saved.count} / ${saved.total} lessons` : 'Start learning'}</small></span><ArrowRight size={14} />
            </button>
          })}
        </div>
        <header><h2>Explore the collection</h2><small>0{active + 1} / 0{courses.length}</small></header>
        <div className="scan-course-carousel" onScroll={event => {
          if (view !== 'collection') return
          const shelf = event.currentTarget
          const first = shelf.firstElementChild
          if (first) setActive(Math.min(courses.length - 1, Math.round(shelf.scrollLeft / (first.clientWidth + 14))))
        }}>
          {courses.map((item, index) => <button key={item.id} type="button" className="scan-course-card" style={{ backgroundImage: `url(${artwork(`cover-${item.id}`)})` }} onClick={() => open(index, 'course')}>
            <span className="scan-course-tags"><span><OriginalsMark /></span><span>{coursePublicationAge(item.publishedAt)}</span></span>
            <span className="scan-course-copy"><b>{item.title}</b><span>{item.subtitle}</span><small><Play size={14} /> {item.lessons.length} lessons · {item.lessons.reduce((sum, entry) => sum + entry.minutes, 0)} min</small></span>
          </button>)}
        </div>
        <div className="scan-course-collection-lessons">
          <header><h2>Inside this course</h2><small>{progress.count} / {progress.total}</small></header>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={course.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>
              {lessonRows}
            </motion.div>
          </AnimatePresence>
        </div>
      </> : <>
        <div className="scan-course-toolbar">
          <button type="button" aria-label="Back" onClick={() => open(active, lesson ? 'course' : 'collection')}><ChevronLeft size={22} /></button>
          <b>{lesson ? lesson.title : course.title}</b>
          <button type="button" aria-label="Close course" onClick={() => open(active, 'collection')}><X size={20} /></button>
        </div>
        <div className="scan-course-detail-hero" style={{ backgroundImage: `url(${artwork(lesson?.id ?? `cover-${course.id}`)})` }}>
          <ProgressiveBlur className="absolute inset-x-0 bottom-0 h-1/3" blurLayers={5} intensity={6} />
        </div>
        <div className="scan-course-detail">
          <OriginalsMark />
          <h1>{lesson?.title ?? course.title}</h1>
          <p>{lesson?.intro ?? course.subtitle}</p>
          {lesson ? <>
            {lesson.sections.map((section, index) => <div key={section.title} className="scan-lesson-section">
              <h2>{section.title}</h2><p>{section.body}</p>
              {index === lesson.guide.afterSection && <div className="scan-lesson-guide">
                <h3>{lesson.guide.title}</h3>
                <motion.div className="scan-lesson-art" initial={false} animate={{ filter: lesson.guide.kind === 'light' ? `brightness(${[.72, 1, 1.2][guide]})` : 'none' }}>
                  <motion.img src={artwork(lesson.id)} alt="" initial={false} animate={{ scale: lesson.guide.kind === 'focus' ? [1, 1.12, 1.24][guide] : 1, x: lesson.guide.kind === 'position' ? [0, -10, 10][guide] : 0 }} />
                  <div aria-hidden="true" className="scan-lesson-art-index">0{guide + 1} / 03</div>
                </motion.div>
                <div role="group" aria-label={lesson.guide.title}>{lesson.controls.map((label, i) => <button key={label} type="button" aria-pressed={i === guide} onClick={() => setGuide(i)}>{label}</button>)}</div>
                <p aria-live="polite">{lesson.captions[guide]}</p>
              </div>}
            </div>)}
            <div className="scan-lesson-guide"><h2>{lesson.question}</h2>
              {lesson.answers.map((answer, i) => <button key={answer} type="button" aria-pressed={choice === i} onClick={() => setChoice(i)}>{answer}</button>)}
              {choice !== null && <p role="status">{choice === lesson.correct ? lesson.explanation : 'Try another answer.'}</p>}
            </div>
            {lesson.source && <a href={lesson.source.url} target="_blank" rel="noreferrer">{lesson.source.title}</a>}
            <button type="button" className="scan-home-primary" onClick={finish}>{completed.includes(lesson.id) ? 'Continue' : 'Complete lesson'} <ArrowRight size={17} /></button>
          </> : <>
            <p>Your progress <b>{progress.count} of {progress.total}</b></p>
            <progress value={progress.count} max={progress.total} />
            <h2>Lessons</h2>
            {lessonRows}
            <button type="button" className="scan-home-primary" onClick={() => open(active, Math.max(0, progress.next))}>{progress.count ? 'Continue course' : 'Start course'} <ArrowRight size={17} /></button>
          </>}
        </div>
      </>}
    </motion.section>
  </AnimatePresence>
}
