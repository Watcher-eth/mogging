// Version IDs are immutable: changing a treatment requires a new experiment ID.
export const LANDING_COOKIE = 'mogging_landing_v1'
export const LANDING_VERSION = '1'
export const landingExperiments = [
  { id: 'landing_hero_v1', name: 'Hero message', control: 'Glow-up + plan', treatment: 'Face insights + next move' },
  { id: 'landing_download_v1', name: 'Persistent download CTA', control: 'Inline buttons', treatment: 'Inline + persistent button' },
] as const
export const landingArms = ['hero_a', 'hero_b', 'download_a', 'download_b'] as const
export type LandingArm = typeof landingArms[number]
export type LandingAssignment = { id: string; arm: LandingArm }

export function parseLandingAssignment(value: string | undefined): LandingAssignment | null {
  if (!value) return null
  const [id, arm, extra] = value.split('.')
  if (extra !== undefined || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id) || !landingArms.includes(arm as LandingArm)) return null
  return { id, arm: arm as LandingArm }
}
export function createLandingAssignment(id: string): LandingAssignment {
  // Two mutually exclusive tests, 25% traffic per arm. No interacting treatments.
  return { id, arm: landingArms[parseInt(id.replaceAll('-', '').slice(-2), 16) % 4] }
}
export function serializeLandingAssignment(assignment: LandingAssignment) {
  return `${assignment.id}.${assignment.arm}`
}
export function landingProperties(assignment: LandingAssignment | null) {
  if (!assignment) return {}
  return {
    landing_id: assignment.id,
    landing_version: LANDING_VERSION,
    experiment_id: assignment.arm.startsWith('hero_') ? landingExperiments[0].id : landingExperiments[1].id,
    variant: assignment.arm.endsWith('_b') ? 'b' : 'a',
  }
}
export function readLandingCookie(cookie: string) {
  return parseLandingAssignment(cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${LANDING_COOKIE}=`))?.slice(LANDING_COOKIE.length + 1))
}
