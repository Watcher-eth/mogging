import type { MoggingWebIconName } from './mogging-web-glyphs'

const categoryIcons: Readonly<Partial<Record<string, MoggingWebIconName>>> = {
  overall: 'evaluation',
  eyes: 'eyes',
  brows: 'brows', eyebrows: 'brows',
  nose: 'nose',
  mouth: 'mouth', lips: 'mouth',
  jaw: 'jaw',
  cheeks: 'cheeks', cheekbones: 'cheeks', 'facial-fat': 'cheeks',
  proportions: 'ruler',
  symmetry: 'harmony',
  skin: 'skin', 'skin-age': 'skin', 'biological-age': 'skin',
  'sun-damage': 'sun',
  hair: 'grooming',
  ears: 'ear',
  dimorphism: 'angle',
}

export function reportCategoryIcon(id: string): MoggingWebIconName {
  return Object.hasOwn(categoryIcons, id) ? categoryIcons[id] ?? 'scan' : 'scan'
}
