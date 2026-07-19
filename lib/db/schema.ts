import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  pgEnum,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

type AccountType = 'email' | 'oauth' | 'oidc' | 'webauthn'

export const genderEnum = pgEnum('gender', ['male', 'female', 'other'])
export const photoTypeEnum = pgEnum('photo_type', ['face', 'body', 'outfit'])
export const photoSourceEnum = pgEnum('photo_source', ['user', 'seeded', 'instagram'])
export const photoSetTypeEnum = pgEnum('photo_set_type', ['single', 'before_after', 'multi_angle'])
export const analysisStatusEnum = pgEnum('analysis_status', ['pending', 'processing', 'complete', 'failed'])
export const ratingAlgorithmEnum = pgEnum('rating_algorithm', ['trueskill_v1'])
export const creatorAuthStatusEnum = pgEnum('creator_auth_status', ['pending', 'verified', 'suspended'])
export const creatorPaymentOptionEnum = pgEnum('creator_payment_option', ['paypal', 'crypto'])
export const creatorSubmissionStatusEnum = pgEnum('creator_submission_status', [
  'pending',
  'in_review',
  'approved',
  'rejected',
  'paid',
])
export const creatorPaymentStatusEnum = pgEnum('creator_payment_status', [
  'pending',
  'processing',
  'paid',
  'failed',
  'cancelled',
])
export const creatorSocialPlatformEnum = pgEnum('creator_social_platform', ['tiktok', 'instagram'])
export const creatorSocialAccountStatusEnum = pgEnum('creator_social_account_status', [
  'pending',
  'approved',
  'missing_information',
])
export const creatorAttributionEventTypeEnum = pgEnum('creator_attribution_event_type', [
  'signup',
  'install',
  'checkout',
  'payment',
  'refund',
  'dispute',
])

export type PaymentProduct =
  | 'evaluation'
  | 'evaluation_pack_3'
  | 'mobile_subscription_weekly'
  | 'mobile_subscription_monthly'
  | 'mobile_subscription_yearly'
  | 'mobile_lifetime'
  | 'extra_potential_image'

export const users = pgTable(
  'users',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name'),
    email: text('email').notNull(),
    emailVerified: timestamp('email_verified', { mode: 'date' }),
    image: text('image'),
    instagramUsername: text('instagram_username'),
    gender: genderEnum('gender'),
    age: integer('age'),
    hairColor: text('hair_color'),
    skinColor: text('skin_color'),
    passwordHash: text('password_hash'),
    bio: text('bio'),
    country: varchar('country', { length: 2 }),
    state: varchar('state', { length: 2 }),
    profileCompleted: boolean('profile_completed').notNull().default(false),
    verified: boolean('verified').notNull().default(false),
    verifiedAt: timestamp('verified_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex('users_email_unique').on(table.email),
  })
)

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.provider, table.providerAccountId],
      name: 'accounts_provider_provider_account_id_pk',
    }),
  })
)

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.identifier, table.token],
      name: 'verification_tokens_identifier_token_pk',
    }),
  })
)

export const anonymousProfiles = pgTable(
  'anonymous_profiles',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    anonymousActorId: text('anonymous_actor_id').notNull(),
    name: text('name').notNull(),
    image: text('image'),
    social: text('social'),
    gender: genderEnum('gender'),
    age: integer('age'),
    hairColor: text('hair_color'),
    skinColor: text('skin_color'),
    country: varchar('country', { length: 2 }),
    state: varchar('state', { length: 2 }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    anonymousActorIdx: uniqueIndex('anonymous_profiles_actor_unique').on(table.anonymousActorId),
  })
)

export const personGroups = pgTable(
  'person_groups',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    anonymousActorId: text('anonymous_actor_id'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('person_groups_user_id_idx').on(table.userId),
    anonymousActorIdx: index('person_groups_anonymous_actor_id_idx').on(table.anonymousActorId),
  })
)

export const photoSets = pgTable(
  'photo_sets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    anonymousActorId: text('anonymous_actor_id'),
    type: photoSetTypeEnum('type').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('photo_sets_user_id_idx').on(table.userId),
    anonymousActorIdx: index('photo_sets_anonymous_actor_id_idx').on(table.anonymousActorId),
  })
)

export const photos = pgTable(
  'photos',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    anonymousActorId: text('anonymous_actor_id'),
    photoSetId: text('photo_set_id').references(() => photoSets.id, { onDelete: 'set null' }),
    personGroupId: text('person_group_id').references(() => personGroups.id, { onDelete: 'set null' }),
    imageUrl: text('image_url').notNull(),
    imageStorageKey: text('image_storage_key'),
    imageHash: text('image_hash').notNull(),
    name: text('name'),
    caption: text('caption'),
    gender: genderEnum('gender').notNull().default('other'),
    age: integer('age'),
    hairColor: text('hair_color'),
    skinColor: text('skin_color'),
    source: photoSourceEnum('source').notNull().default('user'),
    photoType: photoTypeEnum('photo_type').notNull().default('face'),
    position: text('position'),
    isPublic: boolean('is_public').notNull().default(true),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    imageHashIdx: uniqueIndex('photos_image_hash_unique').on(table.imageHash),
    userIdx: index('photos_user_id_idx').on(table.userId),
    anonymousActorIdx: index('photos_anonymous_actor_id_idx').on(table.anonymousActorId),
    personGroupIdx: index('photos_person_group_id_idx').on(table.personGroupId),
    sourceIdx: index('photos_source_idx').on(table.source),
    publicTypeIdx: index('photos_public_type_idx').on(table.isPublic, table.photoType),
    hairColorIdx: index('photos_hair_color_idx').on(table.hairColor),
    skinColorIdx: index('photos_skin_color_idx').on(table.skinColor),
    ageIdx: index('photos_age_idx').on(table.age),
    publicTypeGenderCreatedAtIdx: index('photos_public_type_gender_created_at_idx').on(
      table.isPublic,
      table.photoType,
      table.gender,
      table.createdAt
    ),
    userPublicCreatedAtIdx: index('photos_user_public_created_at_idx').on(table.userId, table.isPublic, table.createdAt),
  })
)

export const analyses = pgTable(
  'analyses',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    photoId: text('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    status: analysisStatusEnum('status').notNull().default('complete'),
    pslScore: real('psl_score'),
    harmonyScore: real('harmony_score'),
    dimorphismScore: real('dimorphism_score'),
    angularityScore: real('angularity_score'),
    percentile: real('percentile'),
    tier: text('tier'),
    tierDescription: text('tier_description'),
    metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
    landmarks: jsonb('landmarks').$type<Record<string, unknown>>().notNull().default({}),
    model: text('model'),
    promptVersion: text('prompt_version'),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    photoIdx: uniqueIndex('analyses_photo_id_unique').on(table.photoId),
    statusIdx: index('analyses_status_idx').on(table.status),
    pslIdx: index('analyses_psl_score_idx').on(table.pslScore),
    createdAtIdx: index('analyses_created_at_idx').on(table.createdAt),
    statusPslCreatedAtIdx: index('analyses_status_psl_created_at_idx').on(table.status, table.pslScore, table.createdAt),
  })
)

export const analysisShares = pgTable(
  'analysis_shares',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    token: text('token').notNull(),
    analysisId: text('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    photoId: text('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    ownerUserId: text('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
    ownerAnonymousActorId: text('owner_anonymous_actor_id'),
    includeLeaderboard: boolean('include_leaderboard').notNull().default(false),
    leaderboardSnapshot: jsonb('leaderboard_snapshot').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    tokenIdx: uniqueIndex('analysis_shares_token_unique').on(table.token),
    analysisIdx: index('analysis_shares_analysis_id_idx').on(table.analysisId),
    photoIdx: index('analysis_shares_photo_id_idx').on(table.photoId),
    ownerIdx: index('analysis_shares_owner_user_id_idx').on(table.ownerUserId),
    anonymousOwnerIdx: index('analysis_shares_owner_anonymous_actor_id_idx').on(table.ownerAnonymousActorId),
  })
)

export const photoRatings = pgTable(
  'photo_ratings',
  {
    photoId: text('photo_id')
      .primaryKey()
      .references(() => photos.id, { onDelete: 'cascade' }),
    algorithm: ratingAlgorithmEnum('algorithm').notNull().default('trueskill_v1'),
    mu: real('mu').notNull().default(25),
    sigma: real('sigma').notNull().default(8.333333),
    conservativeScore: real('conservative_score').notNull().default(0),
    displayRating: integer('display_rating').notNull().default(1000),
    winCount: integer('win_count').notNull().default(0),
    lossCount: integer('loss_count').notNull().default(0),
    comparisonCount: integer('comparison_count').notNull().default(0),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    conservativeScoreIdx: index('photo_ratings_conservative_score_idx').on(table.conservativeScore),
    displayRatingIdx: index('photo_ratings_display_rating_idx').on(table.displayRating),
    conservativeDisplayIdx: index('photo_ratings_conservative_display_idx').on(table.conservativeScore, table.displayRating),
  })
)

export const comparisons = pgTable(
  'comparisons',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    winnerPhotoId: text('winner_photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    loserPhotoId: text('loser_photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    voterUserId: text('voter_user_id').references(() => users.id, { onDelete: 'set null' }),
    anonymousActorId: text('anonymous_actor_id'),
    winnerMuBefore: real('winner_mu_before').notNull(),
    winnerSigmaBefore: real('winner_sigma_before').notNull(),
    loserMuBefore: real('loser_mu_before').notNull(),
    loserSigmaBefore: real('loser_sigma_before').notNull(),
    winnerMuAfter: real('winner_mu_after').notNull(),
    winnerSigmaAfter: real('winner_sigma_after').notNull(),
    loserMuAfter: real('loser_mu_after').notNull(),
    loserSigmaAfter: real('loser_sigma_after').notNull(),
    winnerDisplayRatingAfter: integer('winner_display_rating_after').notNull(),
    loserDisplayRatingAfter: integer('loser_display_rating_after').notNull(),
    algorithm: ratingAlgorithmEnum('algorithm').notNull().default('trueskill_v1'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    winnerIdx: index('comparisons_winner_photo_id_idx').on(table.winnerPhotoId),
    loserIdx: index('comparisons_loser_photo_id_idx').on(table.loserPhotoId),
    voterIdx: index('comparisons_voter_user_id_idx').on(table.voterUserId),
    anonymousActorIdx: index('comparisons_anonymous_actor_id_idx').on(table.anonymousActorId),
    createdAtIdx: index('comparisons_created_at_idx').on(table.createdAt),
  })
)

export const siteStats = pgTable('site_stats', {
  id: text('id').primaryKey().default('global'),
  totalComparisons: integer('total_comparisons').notNull().default(0),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

export const paymentEntitlements = pgTable(
  'payment_entitlements',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    mobileInstallId: text('mobile_install_id').notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    anonymousActorId: text('anonymous_actor_id'),
    stripeCheckoutSessionId: text('stripe_checkout_session_id').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    product: text('product').$type<PaymentProduct>().notNull(),
    creditBalance: integer('credit_balance').notNull().default(0),
    subscriptionStatus: text('subscription_status'),
    currentPeriodEnd: timestamp('current_period_end', { mode: 'date' }),
    activationCodeHash: text('activation_code_hash'),
    activationCodeLast4: text('activation_code_last4'),
    activationCodeRedeemedAt: timestamp('activation_code_redeemed_at', { mode: 'date' }),
    source: text('source'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    mobileInstallIdx: index('payment_entitlements_mobile_install_id_idx').on(table.mobileInstallId),
    userIdx: index('payment_entitlements_user_id_idx').on(table.userId),
    anonymousActorIdx: index('payment_entitlements_anonymous_actor_id_idx').on(table.anonymousActorId),
    sessionIdx: uniqueIndex('payment_entitlements_checkout_session_unique').on(table.stripeCheckoutSessionId),
    paymentIntentIdx: index('payment_entitlements_payment_intent_id_idx').on(table.stripePaymentIntentId),
    activationCodeIdx: index('payment_entitlements_activation_code_hash_idx').on(table.activationCodeHash),
  })
)

export const stripeWebhookEvents = pgTable('stripe_webhook_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const creatorProfiles = pgTable(
  'creator_profiles',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    socialHandle: text('social_handle'),
    authStatus: creatorAuthStatusEnum('auth_status').notNull().default('pending'),
    paymentOption: creatorPaymentOptionEnum('payment_option').notNull().default('paypal'),
    paypalEmail: text('paypal_email'),
    cryptoNetwork: text('crypto_network'),
    cryptoWalletAddress: text('crypto_wallet_address'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: uniqueIndex('creator_profiles_user_id_unique').on(table.userId),
    authStatusIdx: index('creator_profiles_auth_status_idx').on(table.authStatus),
  })
)

export const creatorSubmissions = pgTable(
  'creator_submissions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    creatorProfileId: text('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    socialAccountId: text('social_account_id').references(() => creatorSocialAccounts.id, { onDelete: 'set null' }),
    formatId: text('format_id'),
    requirementsConfirmedAt: timestamp('requirements_confirmed_at', { mode: 'date' }),
    title: text('title').notNull(),
    platform: text('platform').notNull(),
    caption: text('caption'),
    postUrl: text('post_url'),
    videoUrl: text('video_url'),
    videoStorageKey: text('video_storage_key'),
    videoContentType: text('video_content_type'),
    videoSizeBytes: integer('video_size_bytes'),
    analyticsScreenshotUrl: text('analytics_screenshot_url'),
    analyticsStorageKey: text('analytics_storage_key'),
    analyticsContentType: text('analytics_content_type'),
    analyticsSizeBytes: integer('analytics_size_bytes'),
    viewCountThreshold: integer('view_count_threshold'),
    usAudiencePercent: real('us_audience_percent'),
    status: creatorSubmissionStatusEnum('status').notNull().default('pending'),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    creatorIdx: index('creator_submissions_creator_profile_id_idx').on(table.creatorProfileId),
    socialAccountIdx: index('creator_submissions_social_account_id_idx').on(table.socialAccountId),
    statusIdx: index('creator_submissions_status_idx').on(table.status),
    createdAtIdx: index('creator_submissions_created_at_idx').on(table.createdAt),
  })
)

export const creatorSocialAccounts = pgTable(
  'creator_social_accounts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    creatorProfileId: text('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    platform: creatorSocialPlatformEnum('platform').notNull(),
    handle: text('handle').notNull(),
    profileUrl: text('profile_url'),
    avatarUrl: text('avatar_url'),
    connectionMethod: text('connection_method').notNull().default('manual'),
    providerAccountId: text('provider_account_id'),
    oauthVerifiedAt: timestamp('oauth_verified_at', { mode: 'date' }),
    analyticsVideoUrl: text('analytics_video_url'),
    analyticsStorageKey: text('analytics_storage_key'),
    analyticsContentType: text('analytics_content_type'),
    analyticsSizeBytes: integer('analytics_size_bytes'),
    analyticsPeriodDays: integer('analytics_period_days'),
    analyticsConfirmedAt: timestamp('analytics_confirmed_at', { mode: 'date' }),
    status: creatorSocialAccountStatusEnum('status').notNull().default('pending'),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    creatorIdx: index('creator_social_accounts_creator_profile_id_idx').on(table.creatorProfileId),
    statusIdx: index('creator_social_accounts_status_idx').on(table.status),
    uniqueAccountIdx: uniqueIndex('creator_social_accounts_creator_platform_handle_unique').on(
      table.creatorProfileId,
      table.platform,
      table.handle
    ),
    uniqueProviderAccountIdx: uniqueIndex('creator_social_accounts_platform_provider_account_unique').on(
      table.platform,
      table.providerAccountId
    ),
  })
)

export const creatorTrackingLinks = pgTable(
  'creator_tracking_links',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    socialAccountId: text('social_account_id')
      .notNull()
      .references(() => creatorSocialAccounts.id),
    slug: text('slug').notNull(),
    publicUrl: text('public_url').notNull(),
    deepLinkBaseUrl: text('deep_link_base_url').notNull(),
    iosAppStoreUrl: text('ios_app_store_url').notNull(),
    androidAppStoreUrl: text('android_app_store_url'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    socialAccountIdx: uniqueIndex('creator_tracking_links_social_account_unique').on(table.socialAccountId),
    slugIdx: uniqueIndex('creator_tracking_links_slug_unique').on(table.slug),
  })
)

export const creatorAttributionClicks = pgTable(
  'creator_attribution_clicks',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    trackingLinkId: text('tracking_link_id')
      .notNull()
      .references(() => creatorTrackingLinks.id, { onDelete: 'cascade' }),
    anonymousActorId: text('anonymous_actor_id'),
    referrer: text('referrer'),
    userAgent: text('user_agent'),
    isBot: boolean('is_bot').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    trackingLinkIdx: index('creator_attribution_clicks_link_id_idx').on(table.trackingLinkId),
    anonymousActorIdx: index('creator_attribution_clicks_anonymous_actor_id_idx').on(table.anonymousActorId),
    createdAtIdx: index('creator_attribution_clicks_created_at_idx').on(table.createdAt),
  })
)

export const creatorAttributionEvents = pgTable(
  'creator_attribution_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    trackingLinkId: text('tracking_link_id')
      .notNull()
      .references(() => creatorTrackingLinks.id, { onDelete: 'cascade' }),
    clickId: text('click_id').references(() => creatorAttributionClicks.id, { onDelete: 'set null' }),
    firstTrackingLinkId: text('first_tracking_link_id').references(() => creatorTrackingLinks.id, { onDelete: 'set null' }),
    firstClickId: text('first_click_id').references(() => creatorAttributionClicks.id, { onDelete: 'set null' }),
    eventType: creatorAttributionEventTypeEnum('event_type').notNull(),
    attributionKey: text('attribution_key').notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    anonymousActorId: text('anonymous_actor_id'),
    mobileInstallId: text('mobile_install_id'),
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    amountCents: integer('amount_cents').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    dedupeKey: text('dedupe_key').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    trackingLinkIdx: index('creator_attribution_events_link_id_idx').on(table.trackingLinkId),
    clickIdx: index('creator_attribution_events_click_id_idx').on(table.clickId),
    firstTrackingLinkIdx: index('creator_attribution_events_first_link_id_idx').on(table.firstTrackingLinkId),
    userIdx: index('creator_attribution_events_user_id_idx').on(table.userId),
    mobileInstallIdx: index('creator_attribution_events_mobile_install_id_idx').on(table.mobileInstallId),
    checkoutSessionIdx: index('creator_attribution_events_checkout_session_id_idx').on(table.stripeCheckoutSessionId),
    subscriptionIdx: index('creator_attribution_events_subscription_id_idx').on(table.stripeSubscriptionId),
    paymentIntentIdx: index('creator_attribution_events_payment_intent_id_idx').on(table.stripePaymentIntentId),
    dedupeKeyIdx: uniqueIndex('creator_attribution_events_dedupe_key_unique').on(table.dedupeKey),
  })
)

export const mobileCreatorAttributions = pgTable(
  'mobile_creator_attributions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    mobileInstallId: text('mobile_install_id').notNull(),
    trackingLinkId: text('tracking_link_id')
      .notNull()
      .references(() => creatorTrackingLinks.id, { onDelete: 'cascade' }),
    clickId: text('click_id')
      .notNull()
      .references(() => creatorAttributionClicks.id, { onDelete: 'cascade' }),
    firstTrackingLinkId: text('first_tracking_link_id')
      .notNull()
      .references(() => creatorTrackingLinks.id, { onDelete: 'cascade' }),
    firstClickId: text('first_click_id')
      .notNull()
      .references(() => creatorAttributionClicks.id, { onDelete: 'cascade' }),
    attributionKey: text('attribution_key').notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    installClickUnique: uniqueIndex('mobile_creator_attributions_install_click_unique').on(table.mobileInstallId, table.clickId),
    mobileInstallIdx: index('mobile_creator_attributions_mobile_install_id_idx').on(table.mobileInstallId),
    trackingLinkIdx: index('mobile_creator_attributions_link_id_idx').on(table.trackingLinkId),
    clickIdx: index('mobile_creator_attributions_click_id_idx').on(table.clickId),
    userIdx: index('mobile_creator_attributions_user_id_idx').on(table.userId),
  })
)

export const creatorPayments = pgTable(
  'creator_payments',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    creatorProfileId: text('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    submissionId: text('submission_id').references(() => creatorSubmissions.id, { onDelete: 'set null' }),
    amountCents: integer('amount_cents').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    status: creatorPaymentStatusEnum('status').notNull().default('pending'),
    paymentOption: creatorPaymentOptionEnum('payment_option').notNull(),
    providerReference: text('provider_reference'),
    paidAt: timestamp('paid_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    creatorIdx: index('creator_payments_creator_profile_id_idx').on(table.creatorProfileId),
    submissionIdx: index('creator_payments_submission_id_idx').on(table.submissionId),
    statusIdx: index('creator_payments_status_idx').on(table.status),
  })
)

export const creatorAttributionMetrics = pgTable(
  'creator_attribution_metrics',
  {
    submissionId: text('submission_id')
      .primaryKey()
      .references(() => creatorSubmissions.id, { onDelete: 'cascade' }),
    qualifiedViews: integer('qualified_views').notNull().default(0),
    linkClicks: integer('link_clicks').notNull().default(0),
    installs: integer('installs').notNull().default(0),
    firstTimePaidCustomers: integer('first_time_paid_customers').notNull().default(0),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  }
)

export const creatorProgramSettings = pgTable(
  'creator_program_settings',
  {
    id: text('id').primaryKey().default('default'),
    monthlySubscriptionCents: integer('monthly_subscription_cents').notNull().default(999),
    ninetyDayContributionMarginCents: integer('ninety_day_contribution_margin_cents').notNull().default(0),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  }
)

export const usersRelations = relations(users, ({ one, many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  photos: many(photos),
  photoSets: many(photoSets),
  personGroups: many(personGroups),
  analysisShares: many(analysisShares),
  paymentEntitlements: many(paymentEntitlements),
  creatorProfile: one(creatorProfiles),
}))

export const creatorProfilesRelations = relations(creatorProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [creatorProfiles.userId],
    references: [users.id],
  }),
  submissions: many(creatorSubmissions),
  payments: many(creatorPayments),
  socialAccounts: many(creatorSocialAccounts),
}))

export const creatorSocialAccountsRelations = relations(creatorSocialAccounts, ({ one, many }) => ({
  creatorProfile: one(creatorProfiles, {
    fields: [creatorSocialAccounts.creatorProfileId],
    references: [creatorProfiles.id],
  }),
  submissions: many(creatorSubmissions),
  trackingLink: one(creatorTrackingLinks),
}))

export const creatorTrackingLinksRelations = relations(creatorTrackingLinks, ({ one, many }) => ({
  socialAccount: one(creatorSocialAccounts, {
    fields: [creatorTrackingLinks.socialAccountId],
    references: [creatorSocialAccounts.id],
  }),
  clicks: many(creatorAttributionClicks),
  events: many(creatorAttributionEvents, { relationName: 'creator_attribution_event_tracking_link' }),
  firstTouchEvents: many(creatorAttributionEvents, { relationName: 'creator_attribution_event_first_tracking_link' }),
}))

export const creatorAttributionClicksRelations = relations(creatorAttributionClicks, ({ one, many }) => ({
  trackingLink: one(creatorTrackingLinks, {
    fields: [creatorAttributionClicks.trackingLinkId],
    references: [creatorTrackingLinks.id],
  }),
  events: many(creatorAttributionEvents, { relationName: 'creator_attribution_event_click' }),
  firstTouchEvents: many(creatorAttributionEvents, { relationName: 'creator_attribution_event_first_click' }),
}))

export const creatorAttributionEventsRelations = relations(creatorAttributionEvents, ({ one }) => ({
  trackingLink: one(creatorTrackingLinks, {
    fields: [creatorAttributionEvents.trackingLinkId],
    references: [creatorTrackingLinks.id],
    relationName: 'creator_attribution_event_tracking_link',
  }),
  firstTrackingLink: one(creatorTrackingLinks, {
    fields: [creatorAttributionEvents.firstTrackingLinkId],
    references: [creatorTrackingLinks.id],
    relationName: 'creator_attribution_event_first_tracking_link',
  }),
  click: one(creatorAttributionClicks, {
    fields: [creatorAttributionEvents.clickId],
    references: [creatorAttributionClicks.id],
    relationName: 'creator_attribution_event_click',
  }),
  firstClick: one(creatorAttributionClicks, {
    fields: [creatorAttributionEvents.firstClickId],
    references: [creatorAttributionClicks.id],
    relationName: 'creator_attribution_event_first_click',
  }),
  user: one(users, {
    fields: [creatorAttributionEvents.userId],
    references: [users.id],
  }),
}))

export const creatorSubmissionsRelations = relations(creatorSubmissions, ({ one, many }) => ({
  creatorProfile: one(creatorProfiles, {
    fields: [creatorSubmissions.creatorProfileId],
    references: [creatorProfiles.id],
  }),
  socialAccount: one(creatorSocialAccounts, {
    fields: [creatorSubmissions.socialAccountId],
    references: [creatorSocialAccounts.id],
  }),
  attributionMetrics: one(creatorAttributionMetrics),
  payments: many(creatorPayments),
}))

export const creatorAttributionMetricsRelations = relations(creatorAttributionMetrics, ({ one }) => ({
  submission: one(creatorSubmissions, {
    fields: [creatorAttributionMetrics.submissionId],
    references: [creatorSubmissions.id],
  }),
}))

export const creatorPaymentsRelations = relations(creatorPayments, ({ one }) => ({
  creatorProfile: one(creatorProfiles, {
    fields: [creatorPayments.creatorProfileId],
    references: [creatorProfiles.id],
  }),
  submission: one(creatorSubmissions, {
    fields: [creatorPayments.submissionId],
    references: [creatorSubmissions.id],
  }),
}))

export const paymentEntitlementsRelations = relations(paymentEntitlements, ({ one }) => ({
  user: one(users, {
    fields: [paymentEntitlements.userId],
    references: [users.id],
  }),
}))

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}))

export const personGroupsRelations = relations(personGroups, ({ one, many }) => ({
  user: one(users, {
    fields: [personGroups.userId],
    references: [users.id],
  }),
  photos: many(photos),
}))

export const photoSetsRelations = relations(photoSets, ({ one, many }) => ({
  user: one(users, {
    fields: [photoSets.userId],
    references: [users.id],
  }),
  photos: many(photos),
}))

export const photosRelations = relations(photos, ({ one, many }) => ({
  user: one(users, {
    fields: [photos.userId],
    references: [users.id],
  }),
  photoSet: one(photoSets, {
    fields: [photos.photoSetId],
    references: [photoSets.id],
  }),
  personGroup: one(personGroups, {
    fields: [photos.personGroupId],
    references: [personGroups.id],
  }),
  analysis: one(analyses),
  rating: one(photoRatings),
  shares: many(analysisShares),
  wonComparisons: many(comparisons, { relationName: 'winner_comparisons' }),
  lostComparisons: many(comparisons, { relationName: 'loser_comparisons' }),
}))

export const analysesRelations = relations(analyses, ({ one, many }) => ({
  photo: one(photos, {
    fields: [analyses.photoId],
    references: [photos.id],
  }),
  shares: many(analysisShares),
}))

export const analysisSharesRelations = relations(analysisShares, ({ one }) => ({
  analysis: one(analyses, {
    fields: [analysisShares.analysisId],
    references: [analyses.id],
  }),
  photo: one(photos, {
    fields: [analysisShares.photoId],
    references: [photos.id],
  }),
  owner: one(users, {
    fields: [analysisShares.ownerUserId],
    references: [users.id],
  }),
}))

export const photoRatingsRelations = relations(photoRatings, ({ one }) => ({
  photo: one(photos, {
    fields: [photoRatings.photoId],
    references: [photos.id],
  }),
}))

export const comparisonsRelations = relations(comparisons, ({ one }) => ({
  winnerPhoto: one(photos, {
    fields: [comparisons.winnerPhotoId],
    references: [photos.id],
    relationName: 'winner_comparisons',
  }),
  loserPhoto: one(photos, {
    fields: [comparisons.loserPhotoId],
    references: [photos.id],
    relationName: 'loser_comparisons',
  }),
  voter: one(users, {
    fields: [comparisons.voterUserId],
    references: [users.id],
  }),
}))
