// Stable IDs and display order; optional steps are measured only for users who see them.
export const ONBOARDING_ANALYTICS_VERSION = '2';
export const onboardingAnalyticsSteps = [
  ['primer', 'Introduction'], ['protocol_preview', 'Protocol preview'],
  ['age', 'Age'], ['height', 'Height'], ['gender', 'Appearance profile'],
  ['experience', 'Experience'], ['methods', 'Previous methods (optional)'],
  ['goals', 'Goals'], ['protocol_bridge', 'Personalized plan'], ['time', 'Daily commitment'],
  ['commit', 'Hold to commit'], ['reveal', 'Before / after comparison'],
  ['authentication', 'Sign in'], ['location', 'Location (optional)'],
  ['upload', 'Photo / camera'], ['scan_preview', 'Scan preview'],
  ['paywall_plans', 'Paywall plans'], ['paywall_account', 'Paywall account'],
  ['evaluation_processing', 'Evaluation processing'],
] as const;
export type OnboardingAnalyticsStep = typeof onboardingAnalyticsSteps[number][0];
