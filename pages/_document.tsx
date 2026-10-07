import type { DocumentProps } from 'next/document'
import { Html, Head, Main, NextScript } from 'next/document'

export default function Document({ locale }: DocumentProps) {
  return (
    <Html lang={locale ?? 'en'}>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
