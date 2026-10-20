// Stable IDs and display order; optional steps are measured only for users who see them.
export const ONBOARDING_ANALYTICS_VERSION = '6';
export const supportedOnboardingVersions = ['3', '4', '5', '6'] as const;
export const onboardingAnalyticsSteps = [
  ['primer', 'Introduction'], ['impressions', 'First impressions'], ['dating', 'Modern dating'], ['dating_confidence', 'Dating confidence'],
  ['motivation', 'Motivation'], ['relevance', 'Personal relevance'], ['agency', 'Personal agency'],
  ['transformation', 'Transformation illustration'], ['mechanism', 'How Mogging works'],
  ['goals', 'Goals'], ['obstacle', 'Main obstacle'], ['experience', 'Experience'],
  ['methods', 'Previous methods (optional)'], ['evidence', 'Research evidence'],
  ['age', 'Age'], ['gender', 'Appearance profile'], ['time', 'Daily commitment'],
  ['commit', 'Invest in yourself'], ['upload', 'Photo / camera'], ['scan_preview', 'Scan preview'],
  ['report_preview', 'Analysis and Protocol preview'], ['paywall_plans', 'Paywall plans'],
  ['evaluation_processing', 'Evaluation processing'],
  // Older installed builds still emit these optional steps.
  ['protocol_preview', 'Protocol preview (legacy)'], ['height', 'Height (legacy)'],
  ['weight', 'Weight (legacy)'], ['authentication', 'Sign in'], ['paywall_account', 'Paywall account'],
] as const;
export type OnboardingAnalyticsStep = typeof onboardingAnalyticsSteps[number][0];

// Legacy definitions remain available to the dashboard, but never inflate v6 progress.
const legacySteps = new Set<OnboardingAnalyticsStep>(['protocol_preview', 'height', 'weight', 'authentication', 'paywall_account']);
export function onboardingStepProperties(step: OnboardingAnalyticsStep, includeMethods = true) {
  const steps = onboardingAnalyticsSteps.filter(([id]) => !legacySteps.has(id) && (includeMethods || id !== 'methods'));
  return { step, onboarding_version: ONBOARDING_ANALYTICS_VERSION,
    step_index: steps.findIndex(([id]) => id === step), step_count: steps.length };
}
