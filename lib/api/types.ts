export type Gender = 'male' | 'female' | 'other'
export type PhotoType = 'face' | 'body' | 'outfit'

export type ApiPage<TItem> = {
  page: number
  limit: number
  total: number
  items: TItem[]
}

export type NavItem = {
  href: string
  label: string
}
