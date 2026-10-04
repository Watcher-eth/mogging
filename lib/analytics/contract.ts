// Kept identical in web and mobile; contract parity is tested by the rollout checks.
export const analyticsEventNames = [
  'app_opened', 'app_first_open', 'session_started', 'screen_viewed', 'screen_exited',
  'page_viewed', 'page_exited', 'landing_cta_clicked', 'destination_selected', 'app_store_redirected',
  'account_auth_started', 'account_authenticated', 'account_auth_failed', 'identity_linked',
  'attribution_link_received', 'attribution_resolved', 'attribution_diagnostic',
  'onboarding_started', 'onboarding_step_viewed', 'onboarding_step_completed', 'onboarding_step_back',
  'onboarding_step_exited', 'onboarding_step_skipped', 'onboarding_completed', 'permission_prompted', 'permission_result',
  'photo_source_selected', 'photo_selected', 'photo_validation_failed', 'consent_result',
  'paywall_viewed', 'paywall_dismissed', 'paywall_products_loaded', 'plan_selected',
  'checkout_started', 'checkout_completed', 'handoff_created', 'handoff_opened', 'handoff_consumed',
  'purchase_started', 'purchase_completed', 'purchase_failed', 'purchase_cancelled',
  'restore_started', 'restore_failed', 'purchase_restored', 'activation_code_redeemed',
  'evaluation_started', 'evaluation_completed', 'evaluation_failed',
  'report_viewed', 'category_viewed', 'protocol_viewed', 'protocol_task_completed',
  'repeat_evaluation_started', 'share_started', 'share_completed', 'share_failed',
  'referral_invite_created', 'referral_invite_redeemed', 'push_opened',
  'battle_vote_selected', 'battle_vote_cancelled', 'battle_filters_changed', 'settings_opened',
] as const
export type AnalyticsEventName = typeof analyticsEventNames[number]
export type AnalyticsProperties = Record<string, string | number | boolean | null>

// Allowlist protects both ingestion and transport. No URLs, tokens, free-form errors, images,
// demographics, coordinates, user input, or report scores leave the product.
const propertyKeys = new Set([
  'screen', 'previous_screen', 'step', 'step_index', 'step_count', 'onboarding_version', 'flow_id', 'attempt_id',
  'duration_ms', 'surface', 'plan', 'product', 'productId', 'product_id', 'offering',
  'paywall_id', 'paywall_version', 'default_plan', 'product_count', 'products_loaded',
  'channel', 'provider', 'status', 'reason_code', 'error_code', 'active', 'launch', 'launchState',
  'delivery', 'paidMedia', 'subscriptionActive', 'mode', 'permission', 'result', 'source',
  'destination', 'placement', 'path', 'referrer_host', 'category', 'task_id', 'tab',
  'report_id', 'evaluation_id', 'success', 'count', 'push_id', 'campaign_id', 'creative_id',
  'creator_tracking_link_id', 'creator_first_tracking_link_id', 'creator_click_id',
  'locale', 'timezone',
  'appsflyer_id', 'experiment_id', 'variant', 'price', 'currency', 'retry', 'first_evaluation',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'first_utm_source', 'first_utm_medium', 'first_utm_campaign', 'first_utm_content', 'first_utm_term',
  'last_utm_source', 'last_utm_medium', 'last_utm_campaign', 'last_utm_content', 'last_utm_term',
])
export function sanitizeProperties(input: Record<string, unknown>): AnalyticsProperties {
  const output: AnalyticsProperties = {}
  let budget = 2000
  for (const key of Object.keys(input).slice(0, 80)) {
    if (!propertyKeys.has(key)) continue
    const value = input[key]
    const cost = (key.length + (typeof value === 'string' ? Math.min(value.length, 160) : 24)) * 3 + 8
    if (cost > budget) continue
    budget -= cost
    if (value === null || typeof value === 'boolean') output[key] = value
    else if (typeof value === 'number' && Number.isFinite(value)) output[key] = value
    else if (typeof value === 'string') output[key] = value.slice(0, 160)
  }
  return output
}
