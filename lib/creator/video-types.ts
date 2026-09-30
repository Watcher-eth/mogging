export const CREATOR_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const
export type CreatorVideoType = (typeof CREATOR_VIDEO_TYPES)[number]

export const CREATOR_VIDEO_EXTENSIONS: Record<CreatorVideoType, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

const extensionTypes: Record<string, CreatorVideoType> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  webm: 'video/webm',
}

const mimeAliases: Record<string, CreatorVideoType> = {
  'application/mp4': 'video/mp4',
  'video/m4v': 'video/mp4',
  'video/x-m4v': 'video/mp4',
  'video/x-mp4': 'video/mp4',
  'video/mov': 'video/quicktime',
  'video/x-quicktime': 'video/quicktime',
}

export const CREATOR_VIDEO_ACCEPT = [
  ...CREATOR_VIDEO_TYPES,
  ...Object.keys(mimeAliases),
  ...Object.keys(extensionTypes).map((extension) => `.${extension}`),
].join(',')

export function creatorVideoContentType(file: Pick<File, 'type' | 'name'>): CreatorVideoType | null {
  const type = file.type.toLowerCase().split(';')[0].trim()
  if (CREATOR_VIDEO_TYPES.includes(type as CreatorVideoType)) return type as CreatorVideoType
  if (Object.hasOwn(mimeAliases, type)) return mimeAliases[type]
  // Phone file pickers can return blank, generic, or codec-specific video metadata.
  if (type && type !== 'application/octet-stream' && !type.startsWith('video/')) return null
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  return Object.hasOwn(extensionTypes, extension) ? extensionTypes[extension] : null
}
