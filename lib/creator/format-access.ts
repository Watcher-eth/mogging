import { ACTIVE_CREATOR_SUBMISSION_FORMATS } from './formats'

const CUSTOM_FORMAT_CREATOR_IDS = new Set(['05a9b642-86c3-4426-8a8c-722de711e08d']) // Crux

export function getAvailableCreatorSubmissionFormats(profile: { userId: string; authStatus: string } | null | undefined) {
  const customAllowed = profile?.authStatus === 'verified' && CUSTOM_FORMAT_CREATOR_IDS.has(profile.userId)
  return ACTIVE_CREATOR_SUBMISSION_FORMATS.filter((format) => format.id !== 'custom-video-v1' || customAllowed)
}
