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
    passwordHash: text('password_hash'),
    bio: text('bio'),
    state: varchar('state', { length: 2 }),
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

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  photos: many(photos),
  photoSets: many(photoSets),
  personGroups: many(personGroups),
  analysisShares: many(analysisShares),
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
