import { type AnalyticsEventName } from '../analytics/contract'
import type { MetricRow } from './analytics'

// One owner assigns every event to its reporting page. Contract coverage is tested.
export const trackingSections = {
  Acquisition: ['app_first_open', 'page_viewed', 'page_exited', 'landing_viewed', 'landing_section_viewed', 'landing_cta_clicked', 'destination_selected', 'app_store_redirected', 'attribution_link_received', 'attribution_resolved', 'attribution_diagnostic'],
  Authentication: ['account_auth_started', 'account_authenticated', 'account_auth_failed', 'identity_linked'],
  Onboarding: ['onboarding_started', 'onboarding_step_viewed', 'onboarding_step_completed', 'onboarding_step_back', 'onboarding_step_exited', 'onboarding_step_skipped', 'onboarding_completed', 'permission_prompted', 'permission_result', 'photo_source_selected', 'photo_selected', 'photo_validation_failed', 'consent_result'],
  Purchases: ['paywall_viewed', 'paywall_dismissed', 'paywall_products_loaded', 'plan_selected', 'checkout_started', 'checkout_completed', 'handoff_created', 'handoff_opened', 'handoff_consumed', 'purchase_started', 'purchase_completed', 'purchase_failed', 'purchase_cancelled', 'restore_started', 'restore_failed', 'purchase_restored', 'activation_code_redeemed'],
  Scans: ['evaluation_started', 'evaluation_completed', 'evaluation_failed'],
  Engagement: ['app_opened', 'session_started', 'screen_viewed', 'screen_exited', 'report_viewed', 'category_viewed', 'protocol_viewed', 'protocol_task_completed', 'repeat_evaluation_started', 'share_started', 'share_completed', 'share_failed', 'battle_vote_selected', 'battle_vote_cancelled', 'battle_filters_changed', 'settings_opened'],
  Referrals: ['referral_invite_created', 'referral_invite_redeemed'],
  Notifications: ['push_opened'],
} satisfies Record<string, readonly AnalyticsEventName[]>
export type TrackingSection = keyof typeof trackingSections
export const trackingDefinitions = Object.entries(trackingSections).flatMap(([section, events]) => events.map(event => ({ section, event })))

// Scalar context only. Flow/attempt/session IDs are aggregated, never returned as raw rows.
export const trackingDimensions = ['count', 'step_index', 'step_count', 'screen', 'previous_screen', 'step', 'onboarding_version', 'surface', 'plan', 'product', 'productId', 'product_id', 'offering', 'paywall_id', 'paywall_version', 'default_plan', 'product_count', 'products_loaded', 'channel', 'provider', 'status', 'reason_code', 'error_code', 'active', 'launch', 'launchState', 'delivery', 'paidMedia', 'subscriptionActive', 'mode', 'permission', 'result', 'source', 'destination', 'placement', 'path', 'referrer_host', 'category', 'task_id', 'tab', 'success', 'push_id', 'campaign_id', 'creative_id', 'locale', 'timezone', 'experiment_id', 'variant', 'landing_version', 'price', 'currency', 'retry', 'first_evaluation', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'first_utm_source', 'first_utm_medium', 'first_utm_campaign', 'first_utm_content', 'first_utm_term', 'last_utm_source', 'last_utm_medium', 'last_utm_campaign', 'last_utm_content', 'last_utm_term'] as const

export function trackingRows(observations: MetricRow[], section?: TrackingSection): MetricRow[] {
  const byEvent = new Map(observations.map(row => [row.event, row]))
  return trackingDefinitions.filter(row => !section || row.section === section).map(({ event, section }) => {
    const observed = byEvent.get(event)
    return { events: 0, actors: 0, accounts: 0, sessions: 0, attempts: 0, flows: 0, latest_event: null, median_ms: null, p90_ms: null,
      ...observed, event, section, status: Number(observed?.events ?? 0) > 0 ? 'Observed' : 'Awaiting data' }
  })
}

