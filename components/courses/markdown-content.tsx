import ReactMarkdown from 'react-markdown'
import { useEffect } from 'react'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'mark'],
}

export default function MarkdownContent({
  body,
  onReady,
}: {
  body: string
  onReady?: () => void
}) {
  useEffect(() => {
    onReady?.()
  }, [onReady])
  return (
    <div className="c-document">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          // Course images are creator supplied; do not proxy arbitrary URLs through Next Image.
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={alt || ''} loading="lazy" decoding="async" />
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  )
}
