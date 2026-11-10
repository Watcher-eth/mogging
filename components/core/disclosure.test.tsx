import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Disclosure, DisclosureContent, DisclosureTrigger } from './disclosure'

function render(open: boolean) {
  return renderToStaticMarkup(<Disclosure open={open} onOpenChange={() => {}}>
    <DisclosureTrigger>Choose category</DisclosureTrigger>
    <DisclosureContent><button type="button">Symmetry</button></DisclosureContent>
  </Disclosure>)
}

test('collapsed disclosure is a real accessible button without hidden focus targets', () => {
  const markup = render(false)
  expect(markup).toContain('type="button"')
  expect(markup).toContain('aria-expanded="false"')
  expect(markup).toContain('aria-controls=')
  expect(markup).toContain('inert=""')
  expect(markup).not.toContain('Symmetry')
})

test('expanded disclosure associates the trigger with its visible content', () => {
  const markup = render(true)
  const id = markup.match(/aria-controls="([^"]+)"/)?.[1]
  expect(markup).toContain('aria-expanded="true"')
  expect(markup).toContain(`id="${id}"`)
  expect(markup).toContain('Symmetry')
  expect(markup).not.toContain('inert=')
})
