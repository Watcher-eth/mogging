import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useRef, type ReactNode, type MouseEvent } from 'react'
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Play,
  Sparkles,
} from 'lucide-react'
import { MotionConfig } from 'motion/react'
import { MoggingWordmark } from '@/components/brand/mogging-wordmark'
import {
  courseHref,
  courseLessons,
  coursePrice,
  type DemoCourse,
} from '@/lib/courses/demo'
import type { CourseContent } from '@/lib/courses/validation'
import { courseCategoryLabel } from '@/lib/courses/categories'
import { ProgressiveBlur } from './progressive-blur'

export function CourseLayout({
  children,
  title = 'Courses',
  studio = false,
  onNavigate,
}: {
  children: ReactNode
  title?: string
  studio?: boolean
  onNavigate?: (path: string) => Promise<void>
}) {
  const router = useRouter()
  const navigate = (path: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    void onNavigate(path)
  }
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <Head>
        <title>{`${title} · Mogging`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="course-app" data-creator-controls={studio || undefined}>
        <a href="#course-main" className="c-skip">
          Skip to content
        </a>
        <header className="c-header">
          <Link
            href="/courses"
            className="c-brand"
            onClick={navigate('/courses')}
            aria-label="Mogging courses home"
          >
            <MoggingWordmark />
            <span>{studio ? 'studio' : 'courses'}</span>
          </Link>
          <nav aria-label="Courses navigation" className="c-nav">
            <Link
              href="/courses"
              onClick={navigate('/courses')}
              aria-current={router.pathname === '/courses' ? 'page' : undefined}
            >
              Discover
            </Link>
            <Link
              href="/courses/library"
              onClick={navigate('/courses/library')}
              aria-current={
                router.pathname === '/courses/library' ? 'page' : undefined
              }
            >
              My learning
            </Link>
          </nav>
          <Link
            href="/creator/courses"
            onClick={navigate('/creator/courses')}
            className={`c-studio-link ${studio ? 'is-current' : ''}`}
          >
            Creator studio <ArrowUpRight size={14} />
          </Link>
        </header>
        <main id="course-main">{children}</main>
        {router.pathname === '/courses' && (
          <footer className="c-footer">
            <Link href="/" className="c-footer-brand">
              <MoggingWordmark />
            </Link>
            <span>A little more you, every day.</span>
            <div>
              <Link href="/tos">Terms</Link>
              <Link href="/privacy">Privacy</Link>
            </div>
          </footer>
        )}
      </div>
    </MotionConfig>
  )
}

export function CourseImage({
  course,
  priority = false,
  sizes = '(max-width: 700px) 85vw, 380px',
}: {
  course: DemoCourse
  priority?: boolean
  sizes?: string
}) {
  return (
    <Image
      src={course.image}
      unoptimized={course.image.startsWith("https:")}
      alt=""
      fill
      sizes={sizes}
      priority={priority}
      className={`c-course-image image-${course.id}`}
    />
  )
}

export function CourseHero({
  course,
  content = course.content,
  detail = false,
  action,
}: {
  course: DemoCourse
  content?: CourseContent
  detail?: boolean
  action?: ReactNode
}) {
  return (
    <section className={`c-hero ${detail ? 'c-hero-detail' : ''}`}>
      <div className="c-hero-photo">
        <CourseImage
          course={course}
          priority
          sizes="(max-width: 700px) 100vw, 120vw"
        />
      </div>
      <ProgressiveBlur
        className="c-hero-blur"
        direction="left"
        intensity={12}
      />
      <div className="c-hero-fade" />
      <div className="c-hero-copy">
        <span className="c-eyebrow">
          {detail ? course.label : 'A new perspective starts here'}
        </span>
        <h1>{content.title}</h1>
        <p>{content.summary}</p>
        <div className="c-creator-line">
          <Image src={course.avatar} alt="" width={28} height={28} />
          <span>With {course.creator}</span>
          <span className="c-dot">·</span>
          <span>{courseCategoryLabel(content.category)}</span>
        </div>
        <div className="c-hero-actions">
          {action || <Link
            className="c-button c-glass-control"
            href={detail ? `/courses/learn/${course.id}` : courseHref(course)}
          >
            {detail ? <Play size={15} fill="currentColor" /> : null}
            {detail ? 'Preview course' : 'Explore course'}
            {!detail && <ArrowUpRight size={16} />}
          </Link>}
          <span className="c-hero-price">
            <span className="c-price-pill">{coursePrice(content)}</span>
            <span className="c-muted">/ one-time</span>
          </span>
        </div>
        <div className="c-hero-meta">
          {courseLessons(content).length} lessons <span>·</span>{' '}
          {course.duration} <span>·</span> At your pace
        </div>
      </div>
      <div className="c-hero-caption">
        <Sparkles size={15} />
        <span>
          A considered approach.
          <br />
          An everyday difference.
        </span>
      </div>
    </section>
  )
}

export function CourseTile({
  course,
  index,
  learning = false,
}: {
  course: DemoCourse
  index?: number
  learning?: boolean
}) {
  return (
    <Link
      className={`c-tile ${index !== undefined ? 'c-tile-ranked' : ''}`}
      href={learning ? `/courses/learn/${course.id}` : courseHref(course)}
    >
      <div className="c-tile-visual">
        <CourseImage course={course} />
        <ProgressiveBlur className="c-tile-blur" />
        <div className="c-tile-fade" />
        {index !== undefined && (
          <span className="c-rank">{String(index + 1).padStart(2, '0')}</span>
        )}
        <div className="c-tile-overlay">
          <span className="c-eyebrow" title={course.label}>
            {course.label}
          </span>
          <h3 title={course.content.title}>{course.content.title}</h3>
        </div>
        <span className="c-tile-play c-glass-control" aria-hidden="true">
          {learning ? (
            <Play size={16} fill="currentColor" />
          ) : (
            <ArrowUpRight size={20} />
          )}
        </span>
      </div>
      <div className="c-tile-info">
        <strong title={course.creator}>{course.creator}</strong>
        <span className={learning ? 'c-tile-continue' : 'c-price-pill'}>
          {learning ? 'Continue' : coursePrice(course.content)}
        </span>
        <span className="c-tile-meta">
          <span
            className="c-tile-category"
            title={courseCategoryLabel(course.content.category)}
          >
            {courseCategoryLabel(course.content.category)}
          </span>
          <span aria-hidden="true">·</span>
          <span className="c-tile-lessons">
            {courseLessons(course.content).length} lessons
          </span>
        </span>
      </div>
    </Link>
  )
}

export function CourseShelf({
  title,
  subtitle,
  children,
  id,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  id?: string
}) {
  const rail = useRef<HTMLDivElement>(null)
  const move = (direction: number) =>
    rail.current?.scrollBy({
      left: direction * rail.current.clientWidth * 0.8,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    })
  return (
    <section className="c-shelf" id={id}>
      <div className="c-section-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="c-shelf-arrows">
          <button
            className="c-icon-button"
            onClick={() => move(-1)}
            aria-label={`Scroll ${title} left`}
          >
            <ChevronLeft size={19} />
          </button>
          <button
            className="c-icon-button"
            onClick={() => move(1)}
            aria-label={`Scroll ${title} right`}
          >
            <ChevronRight size={19} />
          </button>
        </div>
      </div>
      <div className="c-rail" ref={rail}>
        {children}
      </div>
    </section>
  )
}

export function EmptyCourse({ children }: { children: ReactNode }) {
  return (
    <div className="c-empty">
      <Sparkles size={30} strokeWidth={1.3} />
      {children}
    </div>
  )
}
