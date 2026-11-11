import { createHash } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { DISCORD_API, MOGGING_CREATORS_GUILD_ID } from '@/lib/creator/discord/config'
import { payoutNetworks, type PayoutChain } from './shared'

const announcements = schema.creatorCryptoPayoutAnnouncements
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
type DailyPayout = {
  creatorId: string
  day: string
  handle: string
  amountCents: number
  transfers: { chain: PayoutChain; hash: string }[]
}

function discordRequest(token: string, request: typeof fetch) {
  return async (path: string, method = 'GET', body?: object) => {
    const response = await request(`${DISCORD_API}${path}`, {
      method,
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    })
    if (!response.ok) throw new Error(`Discord API returned HTTP ${response.status}`)
    return response.json()
  }
}

async function payoutChannel(send: ReturnType<typeof discordRequest>, channel: string) {
  const guild = process.env.DISCORD_GUILD_ID || MOGGING_CREATORS_GUILD_ID
  const channels = await send(`/guilds/${guild}/channels`) as { id: string; type: number; name: string }[]
  const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const matches = channels.filter(item => (item.type === 0 || item.type === 5) &&
    (/^\d{17,20}$/.test(channel) ? item.id === channel : slug(item.name) === slug(channel)))
  if (matches.length !== 1) throw new Error('Discord payout channel must match one text channel in the configured server')
  return matches[0].id
}

export async function publishCreatorCryptoPayouts(request: typeof fetch = fetch) {
  const channel = process.env.DISCORD_PAYOUTS_CHANNEL?.trim()
  if (!channel) return { posted: 0, updated: 0, errors: 0 }
  const token = process.env.DISCORD_BOT_TOKEN
  const startsAt = new Date(process.env.DISCORD_PAYOUTS_START_AT || '')
  if (!token || !Number.isFinite(startsAt.getTime())) throw new Error('Discord payouts require a bot token and a start timestamp')
  const send = discordRequest(token, request)
  const channelId = await payoutChannel(send, channel)

  const payouts = await db.execute<DailyPayout>(sql`
    with daily as (
      select p.creator_profile_id, timezone('America/Los_Angeles', p.paid_at at time zone 'UTC')::date as day,
        sum(p.amount_cents)::float8 as amount_cents,
        jsonb_agg(distinct jsonb_build_object('chain', h.chain, 'hash', h.hash)) as transfers
      from creator_payments p
      join creator_crypto_payout_hashes h on h.batch_id = p.crypto_batch_id and h.hash = p.provider_reference
      where p.status = 'paid' and p.payment_option = 'crypto' and p.currency = 'USD' and p.amount_cents > 0
        and p.paid_at >= greatest(
          ${startsAt.toISOString()}::timestamptz at time zone 'UTC',
          ((timezone('America/Los_Angeles', now())::date - 1)::timestamp at time zone 'America/Los_Angeles') at time zone 'UTC'
        )
        and p.paid_at <= now() at time zone 'UTC'
      group by p.creator_profile_id, day
    )
    select d.creator_profile_id as "creatorId", d.day::text as day, account.handle,
      d.amount_cents as "amountCents", d.transfers
    from daily d
    join lateral (
      select lower(ltrim(trim(a.handle), '@')) as handle
      from creator_social_accounts a
      where a.creator_profile_id = d.creator_profile_id and a.platform = 'tiktok' and a.status = 'approved'
        and lower(trim(a.handle)) ~ '^@?[a-z0-9._]{1,40}$' and lower(a.handle) ~ '[a-z0-9]'
      order by a.oauth_verified_at desc nulls last, a.created_at, a.id
      limit 1
    ) account on true
    left join creator_crypto_payout_announcements sent on sent.channel_id = ${channelId}
      and sent.creator_profile_id = d.creator_profile_id and sent.payout_day = d.day
    where d.amount_cents > coalesce(sent.amount_cents, 0)
    order by d.day, d.creator_profile_id
    limit 5
  `)

  const result = { posted: 0, updated: 0, errors: 0 }
  for (const payout of payouts) {
    try {
      const action = await db.transaction(async tx => {
        const key = `creator-crypto-discord:${channelId}:${payout.creatorId}:${payout.day}`
        const [lock] = await tx.execute<{ acquired: boolean }>(sql`select pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) as acquired`)
        if (!lock.acquired) return
        const where = and(eq(announcements.channelId, channelId), eq(announcements.creatorProfileId, payout.creatorId), eq(announcements.payoutDay, payout.day))
        const [previous] = await tx.select().from(announcements).where(where)
        if (previous && previous.amountCents >= payout.amountCents) return

        const urls = payout.transfers.map(({ chain, hash }) => payoutNetworks[chain].explorer + hash).sort()
        const [first, ...other] = urls.slice(0, 10)
        const content = [
          `${first} ${dollars.format(payout.amountCents / 100)} @${payout.handle}`,
          ...other,
          ...(urls.length > 10 ? [`+${urls.length - 10} more transactions`] : []),
        ].join('\n')
        const payload = { content, allowed_mentions: { parse: [] } }
        const path = `/channels/${channelId}/messages`
        if (previous) {
          await send(`${path}/${previous.messageId}`, 'PATCH', payload)
          await tx.update(announcements).set({ amountCents: payout.amountCents }).where(where)
          return 'updated'
        }

        const nonce = createHash('sha256').update(key).digest('hex').slice(0, 25)
        const message = await send(path, 'POST', { ...payload, nonce, enforce_nonce: true }) as { id: string; content: string }
        if (!/^\d{17,20}$/.test(message.id)) throw new Error('Discord did not return a payout message ID')
        if (message.content !== content) await send(`${path}/${message.id}`, 'PATCH', payload)
        await tx.insert(announcements).values({ channelId, creatorProfileId: payout.creatorId, payoutDay: payout.day, messageId: message.id, amountCents: payout.amountCents })
        return 'posted'
      })
      if (action) result[action]++
    } catch (error) {
      result.errors++
      console.error('Creator payout announcement failed', error instanceof Error ? error.message : 'Unknown error')
    }
  }
  return result
}
