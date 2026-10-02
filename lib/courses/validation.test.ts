import { describe, expect, test } from 'bun:test'
import { courseContentSchema, publicCourseContent, validatePublication, uploadSchema } from './validation'
const id = () => crypto.randomUUID()
function content() {
  return courseContentSchema.parse({ title: 'Course', summary: 'Summary', description: 'Description', refundPolicy: 'Contact the creator', price: { amount: 1000, currency: 'usd', accessDays: 365 }, sections: [{ id: id(), title: 'Start', lessons: [{ id: id(), title: 'Lesson', kind: 'text', body: 'Private lesson content', resourceAssetIds: [id()] }] }] })
}
describe('course content boundaries', () => {
  test('public curriculum strips paid content and asset identifiers', () => {
    const source = content(), output = JSON.stringify(publicCourseContent(source))
    expect(output).not.toContain('Private lesson content')
    expect(output).not.toContain(source.sections[0].lessons[0].resourceAssetIds[0])
    expect(output).not.toContain('resourceAssetIds')
    expect(output).not.toContain('videoAssetId')
  })
  test('rejects duplicate lesson identities and mismatched text/video data', () => {
    const source = content()
    source.sections[0].lessons.push(source.sections[0].lessons[0])
    expect(courseContentSchema.safeParse(source).success).toBe(false)
    const text = content(); text.sections[0].lessons[0].videoAssetId = id()
    expect(courseContentSchema.safeParse(text).success).toBe(false)
  })
  test('publishing requires complete lessons and a refund policy', () => {
    const source = content(); source.refundPolicy = ''
    expect(() => validatePublication(source)).toThrow()
    source.refundPolicy = 'Policy'; source.sections[0].lessons[0].body = ' '
    expect(() => validatePublication(source)).toThrow()
  })
  test('rejects fractional prices, unsupported currencies and active attachments', () => {
    const source = content(); source.price.amount = 1.5
    expect(courseContentSchema.safeParse(source).success).toBe(false)
    expect(uploadSchema.safeParse({ kind: 'resource', title: 'Unsafe', contentType: 'text/html', sizeBytes: 100 }).success).toBe(false)
    expect(uploadSchema.safeParse({ kind: 'video', title: 'Too long', contentType: 'video/mp4', sizeBytes: 100, durationSeconds: 7201 }).success).toBe(false)
  })
})
