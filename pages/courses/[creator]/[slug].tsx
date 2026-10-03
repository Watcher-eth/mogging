import { coursePreviewProps } from '@/lib/courses/preview'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, ArrowUpRight, Check, Play } from 'lucide-react'
import {
  CourseHero,
  CourseLayout,
  CourseShelf,
  CourseTile,
  EmptyCourse,
} from '@/components/courses/course-ui'
import {
  courseLessons,
  demoCourses,
  type DemoCourse,
} from '@/lib/courses/demo'
import useSWR from 'swr'
import { courseRequest } from '@/lib/courses/client'
import { courseView, type CourseOverview } from '@/lib/courses/view'
import { CourseCheckout } from '@/components/courses/course-checkout'

function CourseDetail({ course, sample = false }: { course: DemoCourse; sample?: boolean }) {
  const content = course.content
  return (
    <CourseLayout title={content.title}>
      <div className="c-detail-back">
        <Link href="/courses">
          <ArrowLeft size={16} /> All courses
        </Link>
        <span>{sample ? "Design sample · purchases disabled" : ""}</span>
      </div>
      <CourseHero course={course} content={content} detail action={sample ? <span className="c-button c-button-light">Design preview</span> : <CourseCheckout courseId={course.id} free={content.price.amount === 0} />} />
      <section className="c-about">
        <div>
          <span className="c-eyebrow">ABOUT THE COURSE</span>
          <h2>
            A new perspective.
            <br />
            At your own pace.
          </h2>
        </div>
        <div>
          <p className="c-about-description">
            {content.description || 'Your course description will appear here.'}
          </p>
          <ul>
            {content.outcomes.map((outcome) => (
              <li key={outcome}>
                <Check size={17} />
                {outcome}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="c-curriculum-section">
        <div className="c-section-heading">
          <div>
            <h2>One lesson at a time.</h2>
            <p>
              {content.sections.length} chapters ·{' '}
              {courseLessons(content).length} lessons
            </p>
          </div>
          <Link className="c-text-link" href={`/courses/learn/${course.id}`}>
            Start exploring <ArrowUpRight size={16} />
          </Link>
        </div>
        {content.sections.map((section, index) => (
          <div key={section.id} className="c-detail-chapter">
            <div className="c-chapter-heading">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{section.title}</h3>
            </div>
            <div className="c-lesson-tiles">
              {section.lessons.map((lesson, lessonIndex) => (
                <Link
                  href={`/courses/learn/${course.id}?lesson=${lesson.id}`}
                  key={lesson.id}
                  className="c-lesson-tile"
                >
                  <div className="c-lesson-tile-photo">
                    <CourseTileImage course={course} index={lessonIndex} />
                    <span className="c-lesson-tile-play c-glass-control">
                      <Play size={14} fill="currentColor" />
                    </span>
                  </div>
                  <span className="c-eyebrow">
                    LESSON {lessonIndex + 1} ·{' '}
                    {lesson.kind === 'text' ? 'READ' : 'VIDEO'}
                  </span>
                  <h4>{lesson.title}</h4>
                  {lesson.preview && (
                    <span className="c-lesson-free">Free preview</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
        {!content.sections.length && (
          <EmptyCourse>
            <p>Your lessons will appear here as you build your course.</p>
          </EmptyCourse>
        )}
      </section>
      <section className="c-about"><div><h2>Access and refunds</h2></div><div><p>{content.price.accessDays} days of access from enrollment.</p><p>{content.refundPolicy}</p></div></section>
      {sample && <CourseShelf title="Keep exploring.">
        {demoCourses
          .filter((item) => item.id !== course.id)
          .map((item) => (
            <CourseTile key={item.id} course={item} />
          ))}
      </CourseShelf>}
    </CourseLayout>
  )
}

function CourseTileImage({
  course,
  index,
}: {
  course: DemoCourse
  index: number
}) {
  return (
    <Image
      src={index === 1 ? course.avatar : course.image}
      alt=""
      fill
      unoptimized
      sizes="(max-width: 700px) 75vw, 300px"
      style={{
        objectFit: 'cover',
        objectPosition: `center ${index === 1 ? '25%' : '40%'}`,
      }}
    />
  )
}

export default function CourseDetailPage() {
  const router = useRouter()
  const key = router.isReady && typeof router.query.creator === 'string' && typeof router.query.slug === 'string' ? `/api/courses/lookup/${encodeURIComponent(router.query.creator)}/${encodeURIComponent(router.query.slug)}` : null
  const record = useSWR<CourseOverview>(key, courseRequest, { shouldRetryOnError: false })
  const sample = demoCourses.find(item => item.handle === router.query.creator && item.slug === router.query.slug)
  const course = record.data ? courseView(record.data) : record.error ? sample : undefined
  if (!router.isReady || record.isLoading)
    return (
      <CourseLayout>
        <div className="c-loading">Loading course…</div>
      </CourseLayout>
    )
  if (!course)
    return (
      <CourseLayout>
        <EmptyCourse>
          <h1>Course not found.</h1>
          <Link href="/courses" className="c-button c-button-dark">
            Explore courses
          </Link>
        </EmptyCourse>
      </CourseLayout>
    )
  return <CourseDetail key={course.id} course={course} sample={!record.data} />
}

export const getServerSideProps = coursePreviewProps
