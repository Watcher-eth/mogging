import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Highlight from '@tiptap/extension-highlight'
import { Markdown } from '@tiptap/markdown'

// Standard Markdown plus a small, portable HTML mark for highlighting.
export function documentExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      underline: false,
      link: { openOnClick: false, protocols: ['https', 'http', 'mailto'] },
    }),
    Image.configure({ allowBase64: false }),
    Highlight.extend({
      renderMarkdown: (node, helpers) =>
        `<mark>${helpers.renderChildren(node)}</mark>`,
    }),
    Markdown,
  ]
}
