import { bigint, boolean, check, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { creatorProfiles, users } from '@/lib/db/schema'
import type { CourseContent, PublicCourseContent } from './validation'
import type { WatchRange } from './watch-progress'

const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID())
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

// Course contact verification does not change the user's authentication identity.
export const courseContacts = pgTable('course_contacts', {
  userId: text('user_id').primaryKey().references(() => users.id),
  email: text('email'), verifiedAt: timestamp('verified_at', { withTimezone: true }), pendingEmail: text('pending_email'), updatedAt: updatedAt(),
})

export const courseSellers = pgTable('course_sellers', {
  id: id(),
  creatorProfileId: text('creator_profile_id').notNull().references(() => creatorProfiles.id),
  slug: text('slug').notNull(), country: text('country').notNull(), bio: text('bio').notNull().default(''), supportEmail: text('support_email').notNull(),
  status: text('status', { enum: ['pending', 'enabled', 'suspended'] }).notNull().default('pending'),
  stripeAccountId: text('stripe_account_id'),
  stripeConnected: boolean('stripe_connected').notNull().default(false),
  stripeLivemode: boolean('stripe_livemode'),
  chargesEnabled: boolean('charges_enabled').notNull().default(false), payoutsEnabled: boolean('payouts_enabled').notNull().default(false),
  requirements: jsonb('requirements').$type<string[]>().notNull().default([]),
  stripeSyncedAt: timestamp('stripe_synced_at', { withTimezone: true }), createdAt: createdAt(), updatedAt: updatedAt(),
}, table => [uniqueIndex('course_sellers_creator_unique').on(table.creatorProfileId), uniqueIndex('course_sellers_slug_unique').on(table.slug), uniqueIndex('course_sellers_stripe_unique').on(table.stripeAccountId)])

export const courses = pgTable('courses', {
  id: id(), sellerId: text('seller_id').notNull().references(() => courseSellers.id), slug: text('slug').notNull(),
  catalog: jsonb('catalog').$type<PublicCourseContent>(),
  draft: jsonb('draft').$type<CourseContent>().notNull(), published: jsonb('published').$type<CourseContent>(),
  version: integer('version').notNull().default(1), publishedVersion: integer('published_version'), submittedVersion: integer('submitted_version'),
  status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),
  contentBlocked: boolean('content_blocked').notNull().default(false),
  listed: boolean('listed').notNull().default(true), salesEnabled: boolean('sales_enabled').notNull().default(true),
  reviewNote: text('review_note'), stripeProductId: text('stripe_product_id'), stripePriceId: text('stripe_price_id'),
  createdAt: createdAt(), updatedAt: updatedAt(), publishedAt: timestamp('published_at', { withTimezone: true }),
}, table => [uniqueIndex('courses_seller_slug_unique').on(table.sellerId, table.slug), index('courses_catalog_idx').on(table.status, table.listed, table.publishedAt), index('courses_seller_idx').on(table.sellerId), check('courses_version_positive', sql`${table.version} > 0`)])

export const courseAssets = pgTable('course_assets', {
  id: id(), courseId: text('course_id').notNull().references(() => courses.id),
  kind: text('kind', { enum: ['video', 'resource'] }).notNull(), title: text('title').notNull(), contentType: text('content_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(), durationSeconds: doublePrecision('duration_seconds').notNull().default(0),
  state: text('state', { enum: ['pending', 'processing', 'ready', 'failed', 'deleted'] }).notNull().default('pending'),
  bunnyVideoId: text('bunny_video_id'), bunnyLibraryId: text('bunny_library_id'), storageKey: text('storage_key'),
  uploadExpiresAt: timestamp('upload_expires_at', { withTimezone: true }).notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, table => [index('course_assets_course_idx').on(table.courseId), uniqueIndex('course_assets_bunny_unique').on(table.bunnyLibraryId, table.bunnyVideoId), uniqueIndex('course_assets_storage_unique').on(table.storageKey), index('course_assets_pending_idx').on(table.state, table.updatedAt)])

export const courseOrders = pgTable('course_orders', {
  id: id(), courseId: text('course_id').notNull().references(() => courses.id), sellerId: text('seller_id').notNull().references(() => courseSellers.id),
  buyerId: text('buyer_id').notNull().references(() => users.id), stripeAccountId: text('stripe_account_id').notNull(), livemode: boolean('livemode').notNull(),
  stripeCheckoutId: text('stripe_checkout_id'), stripePaymentIntentId: text('stripe_payment_intent_id'), stripeChargeId: text('stripe_charge_id'),
  automaticTax: boolean('automatic_tax').notNull(),
  amount: integer('amount').notNull(), totalAmount: integer('total_amount'), stripePriceId: text('stripe_price_id').notNull(), buyerEmail: text('buyer_email').notNull(), currency: text('currency').notNull(), accessDays: integer('access_days').notNull(),
  courseTitle: text('course_title').notNull(), refundPolicy: text('refund_policy').notNull(), courseVersion: integer('course_version').notNull(),
  refundedAmount: integer('refunded_amount').notNull().default(0), processingFee: integer('processing_fee'), feeCurrency: text('fee_currency'),
  disputed: boolean('disputed').notNull().default(false),
  state: text('state', { enum: ['pending', 'paid', 'failed', 'expired', 'refunded'] }).notNull().default('pending'),
  paidAt: timestamp('paid_at', { withTimezone: true }), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, table => [
  uniqueIndex('course_orders_checkout_unique').on(table.stripeAccountId, table.stripeCheckoutId, table.livemode),
  uniqueIndex('course_orders_payment_unique').on(table.stripeAccountId, table.stripePaymentIntentId, table.livemode),
  uniqueIndex('course_orders_pending_buyer_unique').on(table.buyerId, table.courseId).where(sql`${table.state} = 'pending'`),
  index('course_orders_seller_date_idx').on(table.sellerId, table.createdAt), index('course_orders_buyer_idx').on(table.buyerId, table.createdAt),
  check('course_orders_money_valid', sql`${table.amount} >= 0 and ${table.refundedAmount} >= 0 and ${table.refundedAmount} <= coalesce(${table.totalAmount}, ${table.amount})`),
])

export const courseEnrollments = pgTable('course_enrollments', {
  id: id(), courseId: text('course_id').notNull().references(() => courses.id), userId: text('user_id').notNull().references(() => users.id),
  orderId: text('order_id').references(() => courseOrders.id), source: text('source', { enum: ['purchase', 'free'] }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, table => [uniqueIndex('course_enrollments_user_course_unique').on(table.userId, table.courseId), index('course_enrollments_course_idx').on(table.courseId), uniqueIndex('course_enrollments_order_unique').on(table.orderId)])

export const courseProgress = pgTable('course_progress', {
  userId: text('user_id').notNull().references(() => users.id), courseId: text('course_id').notNull().references(() => courses.id), lessonId: text('lesson_id').notNull(),
  positionSeconds: integer('position_seconds').notNull().default(0), completed: boolean('completed').notNull().default(false), updatedAt: updatedAt(),
  videoAssetId: text('video_asset_id').references(() => courseAssets.id), watchedRanges: jsonb('watched_ranges').$type<WatchRange[]>().notNull().default([]),
}, table => [primaryKey({ columns: [table.userId, table.courseId, table.lessonId] }), check('course_progress_position_valid', sql`${table.positionSeconds} >= 0`)])

export const courseRefunds = pgTable('course_refunds', {
  id: id(), orderId: text('order_id').notNull().references(() => courseOrders.id), requestKey: text('request_key').notNull(),
  amount: integer('amount').notNull(), stripeRefundId: text('stripe_refund_id'), state: text('state').notNull().default('requested'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, table => [uniqueIndex('course_refunds_order_request_unique').on(table.orderId, table.requestKey), uniqueIndex('course_refunds_stripe_unique').on(table.stripeRefundId)])

export const courseEmails = pgTable('course_emails', {
  id: id(), orderId: text('order_id').notNull().references(() => courseOrders.id), to: text('recipient').notNull(),
  attempts: integer('attempts').notNull().default(0), nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }), createdAt: createdAt(),
}, table => [uniqueIndex('course_emails_order_unique').on(table.orderId), index('course_emails_pending_idx').on(table.nextAttemptAt).where(sql`${table.sentAt} is null`)])

export const courseAudit = pgTable('course_audit', {
  id: id(), actorUserId: text('actor_user_id').references(() => users.id), sellerId: text('seller_id').references(() => courseSellers.id),
  courseId: text('course_id').references(() => courses.id), action: text('action').notNull(), detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}), createdAt: createdAt(),
}, table => [index('course_audit_course_date_idx').on(table.courseId, table.createdAt)])
