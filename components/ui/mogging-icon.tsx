import type { ComponentPropsWithRef } from 'react'
import { moggingIconAccentOpacity, moggingIconGrid, moggingIconStroke } from '@/lib/design/mogging-icons'
import { getMoggingWebGlyph, type MoggingWebIconName } from '@/lib/design/mogging-web-glyphs'
import styles from './mogging-icon.module.css'

export type MoggingGlyphProps = Omit<ComponentPropsWithRef<'svg'>, 'name' | 'children'> & {
  size?: number | string
}

type Props = MoggingGlyphProps & {
  name: MoggingWebIconName
  variant?: 'quiet' | 'accent'
  motion?: 'draw'
}

// The surrounding control generally owns the label. An explicitly labeled glyph is exposed.
export function MoggingIcon({
  name, size = 20, variant = 'quiet', motion, stroke = 'currentColor', strokeWidth = moggingIconStroke,
  fill = 'none', ...props
}: Props) {
  const { ink, accent } = getMoggingWebGlyph(name)
  return (
    <svg viewBox={`0 0 ${moggingIconGrid} ${moggingIconGrid}`} width={size} height={size}
      aria-hidden={props['aria-label'] || props['aria-labelledby'] || props.role ? undefined : true}
      focusable="false" fill={fill} stroke={stroke} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" {...props} data-mogging-icon={name} data-icon-motion={motion}
    >
      {accent && variant === 'accent' && fill === 'none' && (
        <path d={accent} fill="currentColor" stroke="none" opacity={moggingIconAccentOpacity} className={styles.accent} />
      )}
      <path d={ink} pathLength={motion ? 1 : undefined} className={styles.ink} />
    </svg>
  )
}
