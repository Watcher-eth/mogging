export type PaywallSurface = 'mobile' | 'desktop'

export type PaywallExposure = {
  id: string
  unit: string
  arm: 'control' | 'treatment'
  surface: PaywallSurface
  kind: 'length' | 'price' | 'onboarding'
  endsAt: number
  minimumPerArm: number
}

export function paywallExperimentProperties(experiment?: PaywallExposure | null) {
  return experiment ? {
    ...(experiment.kind === 'onboarding' ? { entry_mode: 'onboarding_first' } : {}),
    paywall_experiment_id: experiment.id,
    paywall_experiment_unit: experiment.unit,
    paywall_experiment_arm: experiment.arm,
    paywall_experiment_surface: experiment.surface,
    paywall_experiment_kind: experiment.kind,
    paywall_experiment_ends_at: experiment.endsAt,
    paywall_experiment_minimum: experiment.minimumPerArm,
  } : {}
}
