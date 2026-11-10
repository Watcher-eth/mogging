// IDs and treatments are immutable. New designs always start a new experiment.
export const LANDING_COOKIE = 'mogging_landing_v4'
export const DEFAULT_LANDING_ARM = 'homepage_default'
export const LEGACY_LANDING_COOKIE = 'mogging_landing_v1'
export const LANDING_VERSION = '4'
export const landingExperiments = [
  { id: 'landing_homepage_v4', version: LANDING_VERSION, name: 'Mobile homepage: old vs new', control: 'Old homepage', treatment: 'New homepage', status: 'active', traffic: 100, controlShare: 0.3, minimumDays: 14, minimumVisitors: 1000 },
  { id: 'landing_homepage_v3', version: '3', name: 'Homepage: old vs new · iPhone previews', control: 'Old homepage', treatment: 'New homepage · scan-to-report iPhone previews', status: 'archived', traffic: 0, minimumDays: 14, minimumVisitors: 1000 },
  { id: 'landing_homepage_v2', version: '2', name: 'Homepage: old vs new', control: 'Old homepage', treatment: 'New homepage', status: 'archived', traffic: 0, minimumDays: 14, minimumVisitors: 1000 },
  { id: 'landing_hero_v1', version: '1', name: 'Hero message', control: 'Glow-up + plan', treatment: 'Face insights + next move', status: 'archived', traffic: 0, minimumDays: 14, minimumVisitors: 750 },
  { id: 'landing_download_v1', version: '1', name: 'Persistent download CTA', control: 'Inline buttons', treatment: 'Inline + persistent button', status: 'archived', traffic: 0, minimumDays: 14, minimumVisitors: 750 },
] as const
export const landingArms = ['homepage_v4_a', 'homepage_v4_b'] as const
const legacyArms = ['homepage_v3_a', 'homepage_v3_b', 'homepage_a', 'homepage_b', 'hero_a', 'hero_b', 'download_a', 'download_b'] as const
export type LandingArm = typeof landingArms[number] | typeof legacyArms[number] | typeof DEFAULT_LANDING_ARM
export type LandingAssignment = { id: string; arm: LandingArm }

export function parseLandingAssignment(value: string | undefined): LandingAssignment | null {
  if (!value) return null
  const [id, arm, extra] = value.split('.')
  if (extra !== undefined || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id) || ![...landingArms, ...legacyArms, DEFAULT_LANDING_ARM].includes(arm as LandingArm)) return null
  return { id, arm: arm as LandingArm }
}
export function createLandingAssignment(id: string): LandingAssignment {
  const bucket = parseInt(id.slice(-8), 16)
  const controlLimit = Math.floor(2 ** 32 * landingExperiments[0].controlShare)
  return { id, arm: bucket < controlLimit ? landingArms[0] : landingArms[1] }
}
export function isActiveLandingAssignment(assignment: LandingAssignment | null) {
  return Boolean(assignment && landingArms.includes(assignment.arm as typeof landingArms[number]))
}
export function serializeLandingAssignment(assignment: LandingAssignment) {
  return `${assignment.id}.${assignment.arm}`
}
export function landingProperties(assignment: LandingAssignment | null) {
  if (!assignment) return {}
  if (assignment.arm === DEFAULT_LANDING_ARM) return { landing_id: assignment.id, landing_version: LANDING_VERSION }
  const experiment = landingExperiments.find(item => item.id === (assignment.arm.startsWith('homepage_v4_') ? 'landing_homepage_v4' : assignment.arm.startsWith('homepage_v3_') ? 'landing_homepage_v3' : assignment.arm.startsWith('homepage_') ? 'landing_homepage_v2' : assignment.arm.startsWith('hero_') ? 'landing_hero_v1' : 'landing_download_v1'))!
  return { landing_id: assignment.id, landing_version: experiment.version, experiment_id: experiment.id, variant: assignment.arm.endsWith('_b') ? 'b' : 'a' }
}
export function readLandingCookie(cookie: string) {
  const cookies = new Map(cookie.split(';').map(part => { const [name, ...value] = part.trim().split('='); return [name, value.join('=')] }))
  return parseLandingAssignment(cookies.get(LANDING_COOKIE)) ?? parseLandingAssignment(cookies.get('mogging_landing_v3')) ?? parseLandingAssignment(cookies.get('mogging_landing_v2')) ?? parseLandingAssignment(cookies.get(LEGACY_LANDING_COOKIE))
}
