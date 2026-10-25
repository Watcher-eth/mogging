type PhotoOwner = { userId: string | null; anonymousActorId: string | null }
export type PhotoViewer = { userId: string | null; anonymousActorId: string | null }

export function ownsPhoto(photo: PhotoOwner, viewer: PhotoViewer) {
  if (photo.userId) return photo.userId === viewer.userId
  return Boolean(photo.anonymousActorId && photo.anonymousActorId === viewer.anonymousActorId)
}

export function canReadPhoto(photo: PhotoOwner & { isPublic: boolean }, viewer: PhotoViewer) {
  return ownsPhoto(photo, viewer)
}
