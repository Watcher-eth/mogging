import { useEffect, useRef, useState } from 'react'
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import Placeholder from '@tiptap/extension-placeholder'
import { Plugin } from '@tiptap/pm/state'
import { Extension } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import { toast } from 'sonner'
import {
  Bold,
  Italic,
  Highlighter,
  Link2,
  ImagePlus,
  Plus,
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
} from 'lucide-react'
import { documentExtensions } from '@/lib/courses/editor-extensions'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

type Slash = { from: number; to: number; query: string }
type Insert = 'image' | 'link'
const limit = 60_000
const markdownCache = new WeakMap<Node, string>()
const serialize = (editor: Editor, doc = editor.state.doc) => {
  const cached = markdownCache.get(doc)
  if (cached !== undefined) return cached
  const markdown = editor.markdown!.serialize(doc.toJSON())
  markdownCache.set(doc, markdown)
  return markdown
}
const commands = [
  {
    label: 'Text',
    icon: Type,
    run: (e: Editor) => e.chain().focus().setParagraph().run(),
  },
  {
    label: 'Heading 1',
    icon: Heading1,
    run: (e: Editor) => e.chain().focus().setHeading({ level: 1 }).run(),
  },
  {
    label: 'Heading 2',
    icon: Heading2,
    run: (e: Editor) => e.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    label: 'Heading 3',
    icon: Heading3,
    run: (e: Editor) => e.chain().focus().setHeading({ level: 3 }).run(),
  },
  {
    label: 'Bullet list',
    icon: List,
    run: (e: Editor) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: 'Numbered list',
    icon: ListOrdered,
    run: (e: Editor) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    label: 'Quote',
    icon: Quote,
    run: (e: Editor) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    label: 'Code block',
    icon: Code,
    run: (e: Editor) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    label: 'Divider',
    icon: Minus,
    run: (e: Editor) => e.chain().focus().setHorizontalRule().run(),
  },
  { label: 'Image', icon: ImagePlus },
  { label: 'Link', icon: Link2 },
] as const

const contentLimit = Extension.create({
  name: 'lessonContentLimit',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction: (tr) => {
          if (!tr.docChanged || serialize(this.editor, tr.doc).length <= limit)
            return true
          toast.error('Lesson content is limited to 60,000 characters.', {
            id: 'lesson-content-limit',
          })
          return false
        },
      }),
    ]
  },
})
const markdownPaste = Extension.create({
  name: 'lessonMarkdownPaste',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (_, event) => {
            const clipboard = event.clipboardData
            if (
              !clipboard ||
              clipboard.getData('text/html') ||
              !clipboard.getData('text/plain')
            )
              return false
            return this.editor.commands.insertContent(
              clipboard.getData('text/plain'),
              { contentType: 'markdown' },
            )
          },
        },
      }),
    ]
  },
})

function FormatMenu({
  editor,
  insert,
}: {
  editor: Editor
  insert: () => void
}) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      highlight: e.isActive('highlight'),
      link: e.isActive('link'),
    }),
  })
  return (
    <BubbleMenu
      editor={editor}
      className="c-format-menu"
      options={{ placement: 'top', offset: 8 }}
    >
      {[
        {
          label: 'Bold',
          icon: Bold,
          active: active.bold,
          run: () => editor.chain().focus().toggleBold().run(),
        },
        {
          label: 'Italic',
          icon: Italic,
          active: active.italic,
          run: () => editor.chain().focus().toggleItalic().run(),
        },
        {
          label: 'Highlight',
          icon: Highlighter,
          active: active.highlight,
          run: () => editor.chain().focus().toggleHighlight().run(),
        },
        { label: 'Link', icon: Link2, active: active.link, run: insert },
      ].map(({ label, icon: Icon, active, run }) => (
        <button
          type="button"
          key={label}
          aria-label={label}
          aria-pressed={active}
          onMouseDown={(e) => e.preventDefault()}
          onClick={run}
        >
          <Icon size={16} />
        </button>
      ))}
    </BubbleMenu>
  )
}

export default function LessonEditor({
  body,
  onChange,
}: {
  body: string
  onChange: (body: string) => void
}) {
  const change = useRef(onChange)
  change.current = onChange
  const [slash, setSlash] = useState<Slash | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [insert, setInsert] = useState<Insert | null>(null)
  const [url, setUrl] = useState('')
  const [alt, setAlt] = useState('')
  const [error, setError] = useState('')
  const container = useRef<HTMLDivElement>(null)
  const menu = useRef({
    open: false,
    cursor: 0,
    options: commands as readonly (typeof commands)[number][],
  })
  const execute = useRef<(index: number) => void>(() => {})
  const options = commands.filter((command) =>
    command.label.toLowerCase().includes(slash?.query.toLowerCase() || ''),
  )
  menu.current = { open: !!slash || menuOpen, cursor, options }

  const inspect = (e: Editor) => {
    const { $from, empty } = e.state.selection
    const match =
      empty &&
      $from.parent.type.name === 'paragraph' &&
      $from.parentOffset > 0 &&
      $from.parentOffset <= 64 &&
      $from.parent.textBetween(0, 1) === '/' &&
      $from.parent.textBetween(0, $from.parentOffset).match(/^\/([a-z0-9 ]*)$/i)
    const next = match
      ? { from: $from.start(), to: $from.pos, query: match[1] }
      : null
    setSlash((previous) =>
      previous?.from === next?.from && previous?.to === next?.to
        ? previous
        : next,
    )
    if (next) {
      const rect = container.current?.getBoundingClientRect()
      const point = e.view.coordsAtPos($from.pos)
      if (rect)
        setPosition({
          top: point.bottom - rect.top + 6,
          left: Math.max(0, point.left - rect.left),
        })
      setCursor(0)
    }
  }
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [
      ...documentExtensions(),
      Placeholder.configure({ placeholder: "Write, or type '/' for blocks…" }),
      contentLimit,
      markdownPaste,
    ],
    content: body,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        class: 'c-document c-document-editor',
        role: 'textbox',
        'aria-label': 'Lesson content',
        'aria-multiline': 'true',
      },
      handleKeyDown: (_, event) => {
        const state = menu.current
        if (!state.open) return false
        if (event.key === 'Escape') {
          setSlash(null)
          setMenuOpen(false)
          return true
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          setCursor(
            (current) =>
              (current +
                (event.key === 'ArrowDown' ? 1 : state.options.length - 1)) %
              Math.max(1, state.options.length),
          )
          return true
        }
        if (event.key === 'Enter' && state.options.length) {
          execute.current(state.cursor)
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: e }) => {
      change.current(serialize(e))
      inspect(e)
    },
    onSelectionUpdate: ({ editor: e }) => inspect(e),
  })
  useEffect(() => {
    if (!slash && !menuOpen) return
    const close = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        event.target.closest(
          '.c-block-menu, [aria-controls="lesson-block-menu"]',
        )
      )
        return
      setSlash(null)
      setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [slash, menuOpen])
  // External updates (for example undoing a deletion) do not reset the cursor or history.
  useEffect(() => {
    if (editor && serialize(editor) !== body)
      editor.commands.setContent(body, {
        contentType: 'markdown',
        emitUpdate: false,
      })
  }, [body, editor])

  const openInsert = (type: Insert) => {
    setInsert(type)
    setUrl(type === 'link' ? editor?.getAttributes('link').href || '' : '')
    setAlt('')
    setError('')
  }
  execute.current = (index) => {
    if (!editor) return
    const command = options[index]
    if (!command) return
    if (slash)
      editor
        .chain()
        .focus()
        .deleteRange({ from: slash.from, to: slash.to })
        .run()
    setSlash(null)
    setMenuOpen(false)
    if ('run' in command) command.run(editor)
    else openInsert(command.label === 'Image' ? 'image' : 'link')
  }
  const submit = () => {
    if (!editor || !insert) return
    let parsed: URL
    try {
      parsed = new URL(url.trim())
    } catch {
      setError('Enter a full URL.')
      return
    }
    if (
      !(
        insert === 'image' ? ['https:'] : ['https:', 'http:', 'mailto:']
      ).includes(parsed.protocol)
    ) {
      setError(
        insert === 'image'
          ? 'Use an HTTPS image URL.'
          : 'Use an HTTPS, HTTP, or email link.',
      )
      return
    }
    if (insert === 'image') {
      const { $from } = editor.state.selection
      const block = $from.node(1)
      const range =
        block.type.name === 'paragraph' && !block.content.size
          ? { from: $from.before(1), to: $from.after(1) }
          : $from.after(1)
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          { type: 'image', attrs: { src: parsed.href, alt } },
          { type: 'paragraph' },
        ])
        .run()
    } else if (editor.state.selection.empty)
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: alt || parsed.href,
          marks: [{ type: 'link', attrs: { href: parsed.href } }],
        })
        .run()
    else
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: parsed.href })
        .run()
    setInsert(null)
  }
  return (
    <div className="c-lesson-editor" ref={container}>
      <div className="c-document-tools">
        <button
          type="button"
          className="c-text-link"
          aria-expanded={!!slash || menuOpen}
          aria-controls="lesson-block-menu"
          onClick={() => {
            editor?.commands.focus()
            setMenuOpen(!menuOpen)
            setSlash(null)
            setCursor(0)
            setPosition({ top: 32, left: 0 })
          }}
        >
          <Plus size={16} /> Insert block
        </button>
        <span>Markdown shortcuts supported</span>
      </div>
      <EditorContent editor={editor} />
      {editor && (
        <FormatMenu editor={editor} insert={() => openInsert('link')} />
      )}
      {(slash || menuOpen) && (
        <div
          className="c-block-menu"
          id="lesson-block-menu"
          role="menu"
          aria-label="Insert block"
          style={position}
        >
          <span>BLOCKS</span>
          {options.map(({ label, icon: Icon }, index) => (
            <button
              type="button"
              role="menuitem"
              key={label}
              className={index === cursor ? 'is-active' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execute.current(index)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
          {!options.length && <p>No matching blocks.</p>}
        </div>
      )}
      <Dialog
        open={!!insert}
        onOpenChange={(open) => {
          if (!open) {
            setInsert(null)
            editor?.commands.focus()
          }
        }}
      >
        <DialogContent data-creator-controls className="c-preview-dialog">
          <DialogTitle>
            {insert === 'image' ? 'Insert image' : 'Insert link'}
          </DialogTitle>
          <DialogDescription>
            {insert === 'image'
              ? 'Use a hosted image URL.'
              : 'Add a link to the selected text.'}
          </DialogDescription>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <label className="c-field">
              <span>{insert === 'image' ? 'Image URL' : 'Link URL'}</span>
              <input
                autoFocus
                type="url"
                value={url}
                maxLength={2000}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
                required
              />
            </label>
            <label className="c-field">
              <span>
                {insert === 'image'
                  ? 'Image description'
                  : 'Link text (optional)'}
              </span>
              <input
                value={alt}
                maxLength={300}
                onChange={(e) => setAlt(e.target.value)}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <div className="c-dialog-actions">
              {insert === 'link' && editor?.isActive('link') && (
                <button
                  type="button"
                  className="c-text-link"
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .extendMarkRange('link')
                      .unsetLink()
                      .run()
                    setInsert(null)
                  }}
                >
                  Remove link
                </button>
              )}
              <button type="submit" className="c-button c-button-dark">
                Insert
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
