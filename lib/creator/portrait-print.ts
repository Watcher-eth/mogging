import { defaultGlassOverlay, type GlassOverlay } from './glass-overlay'
// One catalog owns print identities, picker copy, shader families and video strength.
export const portraitPrintStyles = [
  { id: 'paper', overlayColor: '#181818', label: 'Fine paper', detail: 'Fine paper grain adds a subtle printed finish to the portrait only.', shader: 'paper', opacity: 1 },
  { id: 'graphite', overlayColor: '#FFFFFF', label: 'Graphite halftone', detail: 'Soft graphite dots blend with the original portrait for a restrained editorial finish.', shader: 'dots', opacity: .68 },
  { id: 'cmyk', overlayColor: '#FFFFFF', label: 'Color print', detail: 'Fine color halftone dots give the portrait a restrained magazine-print finish.', shader: 'cmyk', paperAlpha: .68, opacity: .65 },
  { id: 'riso', overlayColor: '#FFFFFF', label: 'Coral risograph', detail: 'A two-ink dot pattern adds texture while preserving the original portrait colours.', shader: 'cmyk', paperAlpha: .65, opacity: .72 },
  { id: 'blue-ink', overlayColor: '#FFFFFF', label: 'Blue ink', detail: 'Fine ink dots add texture while preserving the original skin colours.', shader: 'dots', opacity: .7 },
  { id: 'vintage', overlayColor: '#202020', label: 'Vintage press', detail: 'Weathered ink texture preserves the original skin tones without pale paper over the face.', shader: 'cmyk', paperAlpha: .65, opacity: .72 },
  { id: 'ink-press', overlayColor: '#FFFFFF', label: 'Ink press', detail: 'Soft, dense ink shapes add a tactile editorial print while retaining the photograph beneath.', shader: 'cmyk', paperAlpha: .3, opacity: .55 },
  { id: 'editorial-dither', overlayColor: '#FFFFFF', label: 'Editorial dither', detail: 'Fine ordered dithering gives the original photo colours a crisp, restrained digital-print texture.', shader: 'dither', opacity: .48 },
] as const
export type PortraitPrint = typeof portraitPrintStyles[number]['id']
export const portraitPrintIds = portraitPrintStyles.map(style => style.id) as [PortraitPrint, ...PortraitPrint[]]

export function portraitOverlayAppearance(filter?: PortraitPrint, appearance?: GlassOverlay): GlassOverlay | undefined {
  if (!filter) return appearance
  const style = portraitPrintStyles.find(style => style.id === filter)!
  return { ...defaultGlassOverlay, ...appearance, color: style.overlayColor, contrast: true, opacity: 1, pattern: appearance?.pattern === 'solid' ? 'solid' : 'dashed' }
}

export function portraitPrintPaperAlpha(filter?: PortraitPrint) {
  const style=portraitPrintStyles.find(style=>style.id===filter)
  return style && 'paperAlpha' in style ? style.paperAlpha : 1
}

// Ink texture may darken the photograph slightly, never replace its colour with paper.
// A single RGB gain preserves source chromaticity; alpha always belongs to the photo.
export function preservePortraitTone(original: Uint8ClampedArray, printed: Uint8ClampedArray) {
  if (original.length !== printed.length) throw new Error('Portrait pixel dimensions must match.')
  for (let offset = 0; offset < original.length; offset += 4) {
    const sourceLight = original[offset] * .2126 + original[offset + 1] * .7152 + original[offset + 2] * .0722
    const inkLight = printed[offset] * .2126 + printed[offset + 1] * .7152 + printed[offset + 2] * .0722
    const shade = 1 - Math.min(.12, Math.max(0, sourceLight - inkLight) / Math.max(1, sourceLight) * .3)
    for (let channel = 0; channel < 3; channel++) printed[offset + channel] = Math.round(original[offset + channel] * shade)
    printed[offset + 3] = original[offset + 3]
  }
}
