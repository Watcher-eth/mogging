import type { CourseContent, CourseLesson } from './validation'

// Isolated preview fixtures. These never create enrollments, Stripe products, or API records.
export type DemoCourse = {
  id: string
  creator: string
  handle: string
  slug: string
  image: string
  avatar: string
  label: string
  duration: string
  content: CourseContent
}

const uuid = (course: number, item: number) =>
  `00000000-0000-4000-8000-${String(course * 1000 + item).padStart(12, '0')}`

function curriculum(
  course: number,
  titles: string[][],
): CourseContent['sections'] {
  return titles.map((section, sectionIndex) => ({
    id: uuid(course, sectionIndex * 100),
    title: section[0],
    lessons: section.slice(1).map((title, index) => ({
      id: uuid(course, sectionIndex * 100 + index + 1),
      title,
      kind: index === 2 ? 'text' : 'video',
      body: `Small changes, made consistently, add up. In this lesson, we’ll explore ${title.toLowerCase()} and turn the essentials into a simple routine you can make your own.\n\nStart by noticing what already works for you. Choose one practical change to try this week, take a few notes, and revisit it before moving on. There is no single perfect approach. The goal is to build something that fits your life.`,
      preview: sectionIndex === 0 && index === 0,
      videoAssetId: null,
      resourceAssetIds: [],
    })),
  }))
}

const seeds = [
  {
    id: 'personal-style',
    creator: 'Alex Morgan',
    handle: 'alex',
    slug: 'personal-style',
    image: '/courses/style.jpg',
    avatar: '/model8.png',
    label: 'THE STYLE EDIT',
    duration: '2h 40m',
    title: 'The art of personal style.',
    summary: 'Find your fit. Refine your wardrobe. Show up as yourself.',
    category: 'looksmaxxing',
    amount: 4900,
    sections: [
      [
        'The foundations',
        'Welcome to your style journey',
        'Finding your personal aesthetic',
        'The wardrobe audit',
      ],
      [
        'Build your signature',
        'Getting the fit right',
        'Color, texture & proportion',
        'Your everyday uniform',
      ],
      ['Make it yours', 'The finishing touches', 'Putting it all together'],
    ],
  },
  {
    id: 'daily-foundations',
    creator: 'James Ellis',
    handle: 'james',
    slug: 'daily-foundations',
    image: '/model8.png',
    avatar: '/model8.png',
    label: 'THE EVERYDAY EDIT',
    duration: '1h 50m',
    title: 'Your best, every day.',
    summary:
      'A thoughtful approach to grooming, hair, and everyday confidence.',
    category: 'face-improvements',
    amount: 3900,
    sections: [
      [
        'Start with the essentials',
        'A fresh perspective',
        'Building your morning routine',
        'Your personal checklist',
      ],
      [
        'The details matter',
        'Hair that works for you',
        'A considered grooming routine',
        'Habits that stay with you',
      ],
    ],
  },
  {
    id: 'stronger',
    creator: 'Noah Reed',
    handle: 'noah',
    slug: 'stronger',
    image: '/courses/fitness.jpg',
    avatar: '/model2.png',
    label: 'BUILT FOR THE LONG RUN',
    duration: '3h 15m',
    title: 'A stronger foundation.',
    summary:
      'Make movement a part of your life. Start simple and build from there.',
    category: 'fitness',
    amount: 5900,
    sections: [
      [
        'Your starting point',
        'Make a plan you can keep',
        'Movement fundamentals',
        'Your first week',
      ],
      [
        'Build consistency',
        'Strength essentials',
        'Recovery & rest',
        'Finding your rhythm',
      ],
    ],
  },
  {
    id: 'skin-simplified',
    creator: 'Sofia Chen',
    handle: 'sofia',
    slug: 'skin-simplified',
    image: '/model4.png',
    avatar: '/model4.png',
    label: 'LESS, BUT BETTER',
    duration: '1h 20m',
    title: 'Skin, simplified.',
    summary:
      'Understand the basics. Build a gentle routine that feels like you.',
    category: 'face-improvements',
    amount: 2900,
    sections: [
      [
        'Back to basics',
        'Getting to know your skin',
        'The essentials, explained',
        'Keep it simple',
      ],
      ['Your daily ritual', 'A morning routine', 'An evening reset'],
    ],
  },
  {
    id: 'wardrobe',
    creator: 'Emma Laurent',
    handle: 'emma',
    slug: 'wardrobe',
    image: '/courses/wardrobe.jpg',
    avatar: '/model11.png',
    label: 'A BETTER CONNECTION',
    duration: '2h 10m',
    title: 'Confidence. Connection. Chemistry.',
    summary:
      'Feel at ease. Start better conversations. Build meaningful connections.',
    category: 'dating',
    amount: 4500,
    sections: [
      [
        'Start with confidence',
        'Making a first impression',
        'Conversation that flows',
        'Listening and connection',
      ],
      ['In practice', 'Planning a first date', 'Finding your chemistry'],
    ],
  },
] as const

export const demoCourses: DemoCourse[] = seeds.map((seed, index) => ({
  id: seed.id,
  creator: seed.creator,
  handle: seed.handle,
  slug: seed.slug,
  image: seed.image,
  avatar: seed.avatar,
  label: seed.label,
  duration: seed.duration,
  content: {
    title: seed.title,
    summary: seed.summary,
    category: seed.category,
    coverUrl: null,
    language: 'en',
    description: `${seed.summary} A practical, considered course that gives you the space to learn at your own pace. Follow along with clear lessons, everyday examples, and small exercises that help you put each idea into practice.`,
    outcomes: [
      'Build a routine that fits your life',
      'Understand the essentials with confidence',
      'Put what you learn into everyday practice',
    ],
    refundPolicy:
      'Sample course for design preview. No purchases are available.',
    price: { amount: seed.amount, currency: 'usd', accessDays: 365 },
    sections: curriculum(
      index + 1,
      seed.sections.map((section) => [...section]),
    ),
  },
}))

export const newDemoCourse: DemoCourse = {
  ...demoCourses[0],
  id: 'new-course',
  slug: 'new-course',
  label: 'YOUR NEXT CHAPTER',
  content: {
    ...demoCourses[0].content,
    title: 'Untitled course',
    summary: '',
    description: '',
    outcomes: [],
    sections: [],
  },
}

export const findDemoCourse = (id: string) =>
  id === newDemoCourse.id
    ? newDemoCourse
    : demoCourses.find((course) => course.id === id)
export const courseHref = (course: DemoCourse) =>
  `/courses/${course.handle}/${course.slug}`
export const coursePrice = (content: CourseContent) =>
  content.price.amount === 0
    ? 'Free'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: content.price.currency.toUpperCase(),
        maximumFractionDigits: 2,
      }).format(content.price.amount / 100)
export const courseLessons = (content: CourseContent) =>
  content.sections.flatMap((section) => section.lessons)
export const makeLesson = (): CourseLesson => ({
  id: crypto.randomUUID(),
  title: 'Untitled lesson',
  kind: 'video',
  body: '',
  videoAssetId: null,
  resourceAssetIds: [],
  preview: false,
})
