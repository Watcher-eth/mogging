type PhotoOwner = { userId: string | null; anonymousActorId: string | null }
type Viewer = { userId: string | null; anonymousActorId: string | null }

export function ownsPhoto(photo: PhotoOwner, viewer: Viewer) {
  if (photo.userId) return photo.userId === viewer.userId
  return Boolean(photo.anonymousActorId && photo.anonymousActorId === viewer.anonymousActorId)
}

export function canReadPhoto(photo: PhotoOwner & { isPublic: boolean }, viewer: Viewer) {
  return photo.isPublic || ownsPhoto(photo, viewer)
}
