import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownManager } from '@tiptap/markdown'
import MarkdownContent from '@/components/courses/markdown-content'
import { documentExtensions } from './editor-extensions'
import { reorderLesson } from './reorder'
import { findDemoCourse } from './demo'

describe('course documents', () => {
  test('headings, lists, links, code, and images survive a Markdown round trip', () => {
    const markdown =
      '# Wardrobe audit\n\n**Start here** and [read more](https://example.com).\n\n- First step\n- Second step\n\n> Keep a note\n\n![Example](https://example.com/image.jpg)\n\n```js\nconst value = 1\n```'
    const manager = new MarkdownManager({ extensions: documentExtensions() })
    const doc = manager.parse(markdown)
    expect(manager.parse(manager.serialize(doc))).toEqual(doc)
  })
  test('renders supported formatting while stripping executable HTML and unsafe links', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        body={
          '## Heading\n\n<mark>Highlighted</mark> **Bold**\n\n<script>alert(1)</script><img src="https://example.com/image.jpg" onerror="alert(2)">\n\n[Unsafe](javascript:alert%281%29)'
        }
      />,
    )
    expect(html).toContain('<h2>Heading</h2>')
    expect(html).toContain('<mark>Highlighted</mark>')
    expect(html).toContain('<strong>Bold</strong>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
  })
})

describe('lesson ordering', () => {
  const content = findDemoCourse('personal-style')!.content
  test('moves in both directions without changing IDs, content, or the original draft', () => {
    const [first, second] = content.sections[0].lessons
    const moved = reorderLesson(content, first.id, second.id)
    expect(moved.sections[0].lessons[1]).toEqual(first)
    expect(reorderLesson(moved, first.id, second.id)).toEqual(content)
    expect(content.sections[0].lessons[0]).toBe(first)
  })
  test('moves across chapters once and preserves the total lesson count', () => {
    const lesson = content.sections[0].lessons[0]
    const target = content.sections[1].lessons[0]
    const moved = reorderLesson(content, lesson.id, target.id)
    expect(
      moved.sections[0].lessons.some((item) => item.id === lesson.id),
    ).toBe(false)
    expect(moved.sections[1].lessons[0]).toEqual(lesson)
    expect(moved.sections.flatMap((section) => section.lessons)).toHaveLength(
      content.sections.flatMap((section) => section.lessons).length,
    )
    expect(reorderLesson(content, lesson.id, 'missing')).toBe(content)
  })
  test('does not move into a full chapter', () => {
    const lesson = content.sections[0].lessons[0]
    const full = {
      ...content,
      sections: content.sections.map((section, index) =>
        index === 1
          ? {
              ...section,
              lessons: Array.from({ length: 100 }, (_, i) => ({
                ...section.lessons[0],
                id: `full-${i}`,
              })),
            }
          : section,
      ),
    }
    expect(reorderLesson(full, lesson.id, 'full-0')).toBe(full)
  })
  test('moves into an empty chapter without losing or duplicating a lesson', () => {
    const emptyId = crypto.randomUUID(), lesson = content.sections[0].lessons[0]
    const original = { ...content, sections: [...content.sections, { id: emptyId, title: 'Empty', lessons: [] }] }
    const moved = reorderLesson(original, lesson.id, emptyId)
    expect(moved.sections.at(-1)?.lessons).toEqual([lesson])
    expect(moved.sections.flatMap(section => section.lessons).filter(item => item.id === lesson.id)).toHaveLength(1)
    expect(original.sections.at(-1)?.lessons).toEqual([])
  })
})
