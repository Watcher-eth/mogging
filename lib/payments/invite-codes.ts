import { createHmac, randomInt } from 'node:crypto'
import { and, desc, eq, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { ApiError } from '@/lib/api/http'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { getEntitlementSummary } from '@/lib/payments/entitlements'
import type { InviteCodeKind, InviteCodeScope, PaymentProduct } from '@/lib/db/schema'

export const inviteCodeScopeSchema = z.object({
  evaluationCredits: z.number().int().min(0).max(500).optional(),
  unlimitedEvaluations: z.boolean().optional(),
  durationDays: z.number().int().min(1).max(3650).nullable().optional(),
}).superRefine((scope, ctx) => {
  const credits = scope.evaluationCredits ?? 0
  const unlimited = scope.unlimitedEvaluations === true
  if (!credits && !unlimited) {
    ctx.addIssue({ code: 'custom', message: 'Choose evaluation credits or unlimited access' })
  }
  if (credits && unlimited) {
    ctx.addIssue({ code: 'custom', message: 'Use either evaluation credits or unlimited access, not both' })
  }
})

export const createInviteCodeSchema = z.object({
  label: z.string().trim().min(1).max(80),
  kind: z.enum(['invite', 'referral']).default('invite'),
  attribution: z.string().trim().max(120).optional().nullable(),
  scope: inviteCodeScopeSchema,
  maxRedemptions: z.number().int().min(1).max(100_000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  code: z.string().trim().regex(/^\d{6}$/).optional(),
})

export type CreateInviteCodeInput = z.infer<typeof createInviteCodeSchema>

export type InviteCodeDashboardItem = {
  id: string
  codeLast4: string
  label: string
  kind: InviteCodeKind
  attribution: string | null
  scope: InviteCodeScope
  maxRedemptions: number | null
  redemptionCount: number
  active: boolean
  expiresAt: string | null
  createdBy: string | null
  createdAt: string
}

export async function listInviteCodes(): Promise<InviteCodeDashboardItem[]> {
  const rows = await db.query.inviteCodes.findMany({
    orderBy: [desc(schema.inviteCodes.createdAt)],
    limit: 200,
  })
  return rows.map(serializeInviteCode)
}

export async function createInviteCode(input: CreateInviteCodeInput & { createdBy?: string | null }) {
  const normalized = createInviteCodeSchema.parse(input)
  const code = normalized.code || await generateUniqueInviteCode()
  const now = new Date()
  const [row] = await db
    .insert(schema.inviteCodes)
    .values({
      codeHash: hashInviteCode(code),
      codeLast4: code.slice(-4),
      label: normalized.label,
      kind: normalized.kind,
      attribution: normalized.attribution || null,
      scope: normalizeScope(normalized.scope),
      maxRedemptions: normalized.maxRedemptions ?? null,
      active: true,
      expiresAt: normalized.expiresAt ? new Date(normalized.expiresAt) : null,
      createdBy: input.createdBy || null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  return {
    code,
    inviteCode: serializeInviteCode(row),
  }
}

export async function redeemInviteCode({
  code,
  mobileInstallId,
  userId,
}: {
  code: string
  mobileInstallId: string
  userId: string
}) {
  const normalizedCode = normalizeInviteCode(code)
  const codeHash = hashInviteCode(normalizedCode)
  await db.transaction(async (tx) => {
    const invite = await tx.query.inviteCodes.findFirst({
      where: eq(schema.inviteCodes.codeHash, codeHash),
    })

    if (!invite) throw new ApiError(404, 'Invite code not found')
    if (!invite.active) throw new ApiError(409, 'This invite code is no longer active')
    if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) throw new ApiError(409, 'This invite code has expired')
    if (invite.maxRedemptions !== null && invite.redemptionCount >= invite.maxRedemptions) {
      throw new ApiError(409, 'This invite code has no redemptions left')
    }

    const existing = await tx.query.inviteCodeRedemptions.findFirst({
      where: and(
        eq(schema.inviteCodeRedemptions.inviteCodeId, invite.id),
        eq(schema.inviteCodeRedemptions.userId, userId)
      ),
    })
    if (existing) throw new ApiError(409, 'This invite code has already been used on this account')

    const [reserved] = await tx
      .update(schema.inviteCodes)
      .set({
        redemptionCount: sql`${schema.inviteCodes.redemptionCount} + 1`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(schema.inviteCodes.id, invite.id),
        eq(schema.inviteCodes.active, true),
        invite.maxRedemptions === null ? undefined : lt(schema.inviteCodes.redemptionCount, invite.maxRedemptions)
      ))
      .returning({ id: schema.inviteCodes.id })
    if (!reserved) throw new ApiError(409, 'This invite code has no redemptions left')

    const grant = makeEntitlementGrant(invite.scope)
    const [entitlement] = await tx
      .insert(schema.paymentEntitlements)
      .values({
        mobileInstallId,
        userId,
        anonymousActorId: null,
        stripeCheckoutSessionId: `invite:${invite.id}:${userId}`,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePaymentIntentId: null,
        product: grant.product,
        creditBalance: grant.creditBalance,
        subscriptionStatus: grant.subscriptionStatus,
        currentPeriodEnd: grant.currentPeriodEnd,
        activationCodeHash: null,
        activationCodeLast4: null,
        activationCodeRedeemedAt: new Date(),
        source: invite.kind === 'referral' ? 'admin_referral_code' : 'admin_invite_code',
        metadata: {
          inviteCodeId: invite.id,
          inviteCodeKind: invite.kind,
          attribution: invite.attribution,
          scope: invite.scope,
        },
      })
      .returning({ id: schema.paymentEntitlements.id })

    await tx.insert(schema.inviteCodeRedemptions).values({
      inviteCodeId: invite.id,
      userId,
      mobileInstallId,
      paymentEntitlementId: entitlement.id,
    })
  })

  return getEntitlementSummary({ mobileInstallId, userId })
}

export function normalizeInviteCode(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!/^\d{6}$/.test(digits)) throw new ApiError(400, 'Invite code must be six digits')
  return digits
}

function normalizeScope(scope: InviteCodeScope): InviteCodeScope {
  return {
    evaluationCredits: scope.evaluationCredits || undefined,
    unlimitedEvaluations: scope.unlimitedEvaluations === true || undefined,
    durationDays: scope.durationDays ?? null,
  }
}

function makeEntitlementGrant(scope: InviteCodeScope): {
  product: PaymentProduct
  creditBalance: number
  subscriptionStatus: string | null
  currentPeriodEnd: Date | null
} {
  if (scope.unlimitedEvaluations) {
    const durationDays = scope.durationDays ?? null
    return {
      product: durationDays ? 'mobile_subscription_monthly' : 'mobile_lifetime',
      creditBalance: 0,
      subscriptionStatus: 'active',
      currentPeriodEnd: durationDays ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null,
    }
  }

  return {
    product: 'evaluation',
    creditBalance: Math.max(1, scope.evaluationCredits || 1),
    subscriptionStatus: null,
    currentPeriodEnd: null,
  }
}

async function generateUniqueInviteCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const existing = await db.query.inviteCodes.findFirst({
      where: eq(schema.inviteCodes.codeHash, hashInviteCode(code)),
      columns: { id: true },
    })
    if (!existing) return code
  }
  throw new ApiError(500, 'Unable to generate an unused invite code')
}

function hashInviteCode(code: string) {
  return createHmac('sha256', getInviteCodeSecret())
    .update(`admin-invite:${normalizeInviteCode(code)}`)
    .digest('hex')
}

function getInviteCodeSecret() {
  return env.NEXTAUTH_SECRET || env.STRIPE_WEBHOOK_SECRET || env.DATABASE_URL
}

function serializeInviteCode(row: typeof schema.inviteCodes.$inferSelect): InviteCodeDashboardItem {
  return {
    id: row.id,
    codeLast4: row.codeLast4,
    label: row.label,
    kind: row.kind,
    attribution: row.attribution,
    scope: row.scope,
    maxRedemptions: row.maxRedemptions,
    redemptionCount: row.redemptionCount,
    active: row.active,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  }
}
