import { coursePageProps, type CoursePageProps } from '@/lib/courses/pages'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, Search, X } from 'lucide-react'
import {
  CourseHero,
  CourseLayout,
  CourseShelf,
  CourseTile,
  EmptyCourse,
} from '@/components/courses/course-ui'
import { demoCourses } from '@/lib/courses/demo'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'
import { courseRequest } from '@/lib/courses/client'
import { courseView, type CourseOverview } from '@/lib/courses/view'
import { courseCategoryIds, courseCategoryLabel } from '@/lib/courses/categories'

const categories = ['all', ...courseCategoryIds]

export default function CoursesPage({ allowSamples }: CoursePageProps) {
  const [featured, setFeatured] = useState(0)
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])
  const catalog = useSWR<{ items: CourseOverview[]; hasMore: boolean }>('/api/courses?limit=3', courseRequest)
  const sample = allowSamples && catalog.data?.items.length === 0 && !catalog.error
  const browse = useSWRInfinite<{ items: CourseOverview[]; hasMore: boolean }>(
    (index, previous) => {
      if (sample || previous && !previous.hasMore) return null
      const params = new URLSearchParams({ page: String(index + 1), limit: '24' })
      if (category !== 'all') params.set('category', category)
      if (search) params.set('q', search)
      return `/api/courses?${params}`
    }, courseRequest, { revalidateFirstPage: false },
  )
  const featuredCourses = catalog.data?.items.map(courseView) || []
  const highlights = sample ? demoCourses.slice(0, 3) : featuredCourses
  const activeHighlight = highlights.length ? highlights[featured % highlights.length] : undefined
  const courses = sample ? demoCourses : browse.data?.flatMap(page => page.items.map(courseView)) || []
  const filtered = sample ? courses.filter(course =>
    (category === 'all' || course.content.category === category) &&
    `${course.content.title} ${course.creator} ${courseCategoryLabel(course.content.category)}`.toLowerCase().includes(query.toLowerCase().trim()),
  ) : courses
  const isFiltered = category !== 'all' || query.trim() !== ''

  return (
    <CourseLayout>
      <div className="c-discover-intro">
        <div>
          <span className="c-eyebrow">THE MOGGING COLLECTION</span>
          <h2>Invest in yourself.</h2>
        </div>
        <p>
          A fresh perspective. A better routine.
          <br />
          Learn from people who know their craft.
        </p>
      </div>
      {activeHighlight && <div className="c-featured">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={activeHighlight.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <CourseHero course={activeHighlight} />
          </motion.div>
        </AnimatePresence>
        <div className="c-carousel-dots" aria-label="Featured courses">
          {highlights.map((course, index) => (
            <button
              key={course.id}
              aria-label={`Feature ${course.content.title}`}
              aria-pressed={featured === index}
              onClick={() => setFeatured(index)}
              className={featured === index ? 'is-active' : ''}
            />
          ))}
        </div>
      </div>}
      <div className="c-discovery-tools">
        <div className="c-filter-tabs" aria-label="Course categories">
          {categories.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              aria-pressed={category === item}
              className={category === item ? 'is-active' : ''}
            >
              {item === 'all' ? 'All courses' : courseCategoryLabel(item)}
            </button>
          ))}
        </div>
        <label className="c-search">
          <Search size={17} />
          <input
            aria-label="Search courses"
            placeholder="Find your next course"
            value={query}
            maxLength={100}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search">
              <X size={15} />
            </button>
          )}
        </label>
      </div>
      {isFiltered ? (
        <section className="c-search-results">
          <div className="c-section-heading">
            <div>
              <h2>{query ? `Results for “${query}”` : courseCategoryLabel(category)}</h2>
              <p>
                {filtered.length} {filtered.length === 1 ? 'course' : 'courses'}{' '}
                to explore
              </p>
            </div>
          </div>
          {!sample && !browse.data && !browse.error ? <p className="c-muted" role="status">Loading courses…</p> : filtered.length ? (
            <div className="c-course-grid">
              {filtered.map((course) => (
                <CourseTile key={course.id} course={course} />
              ))}
            </div>
          ) : (
            <EmptyCourse>
              <h2>A fresh search?</h2>
              <p>Try another name, topic, or category.</p>
              <button
                className="c-button c-button-light"
                onClick={() => {
                  setCategory('all')
                  setQuery('')
                }}
              >
                Show all courses
              </button>
            </EmptyCourse>
          )}
        </section>
      ) : (
        <>
          {!sample && !browse.data && !browse.error ? (
            <p className="c-preview-note" role="status">Loading courses…</p>
          ) : courses.length === 0 && !browse.error ? (
            <EmptyCourse><h2>No courses available yet.</h2><p>Check back soon.</p></EmptyCourse>
          ) : (
            <CourseShelf title="Made for your next chapter." subtitle="Thoughtful courses. Practical changes.">
              {courses.map(course => <CourseTile key={course.id} course={course} />)}
            </CourseShelf>
          )}
          <section className="c-editorial">
            <div>
              <span className="c-eyebrow">
                SMALL CHANGES. LASTING DIFFERENCE.
              </span>
              <h2>
                Make room
                <br />
                for a better you.
              </h2>
              <p>
                Looksmaxxing, face improvements, dating, and fitness.
                <br />
                Find your starting point, and make it your own.
              </p>
              <Link href="/creator/courses" className="c-text-link">
                Share what you know <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="c-editorial-note">
              <span>01 — 05</span>
              <p>
                Expert-led.
                <br />
                Self-paced.
                <br />
                Uniquely yours.
              </p>
            </div>
          </section>
          <CourseShelf
            title="The collection, at a glance."
            subtitle="A little inspiration for every part of your routine."
          >
            {courses.map((course, index) => (
              <CourseTile key={course.id} course={course} index={index} />
            ))}
          </CourseShelf>
        </>
      )}
      {!sample && browse.data?.at(-1)?.hasMore && <div className="c-preview-note"><button className="c-button c-button-light" disabled={browse.isValidating} onClick={() => void browse.setSize(browse.size + 1)}>{browse.isValidating ? 'Loading…' : 'Load more courses'}</button></div>}
      {(catalog.error || browse.error) && <p className="c-preview-note" role="alert">Courses could not be loaded. <button onClick={() => { void catalog.mutate(); void browse.mutate() }}>Try again</button></p>}
      {allowSamples && <div className="c-preview-note">{sample ? "Sample courses and creators for design preview. Purchases are disabled." : "Development storefront · not publicly launched."}</div>}
    </CourseLayout>
  )
}

export const getServerSideProps = coursePageProps
