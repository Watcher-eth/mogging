import { randomUUID } from 'node:crypto'
import { REST } from '@discordjs/rest'
import { WebSocketManager, WebSocketShardEvents } from '@discordjs/ws'
import { discordConfig } from './config'
import { discordStore } from './store'
import { directMessageSchema } from './dm-contract'
import { handleDirectMessage } from './direct-messages'

// No guild messages, member lists, reactions, or privileged Message Content intent.
export const DIRECT_MESSAGE_INTENT = 1 << 12
export const DM_GATEWAY_OWNER = 'creator-discord:dm-gateway:owner'
export const DM_GATEWAY_STATUS = 'creator-discord:dm-gateway:status'
export const DM_LISTENER_DURATION_MS = 420_000

/** A five-minute cron starts the replacement before the seven-minute listener expires. */
export async function runDirectMessageGateway(options: { durationMs?: number; signal?: AbortSignal } = {}) {
  const configuration = discordConfig(), redis = discordStore(), listenerId = randomUUID()
  const durationMs = options.durationMs ?? DM_LISTENER_DURATION_MS
  const manager = new WebSocketManager({ token: configuration.botToken, intents: DIRECT_MESSAGE_INTENT, shardCount: 1, shardIds: [0], rest: new REST({ timeout: 10_000, retries: 1 }).setToken(configuration.botToken), handshakeTimeout: 15_000, helloTimeout: 15_000, readyTimeout: 20_000 })
  const pending = new Set<Promise<void>>()
  let activated = false, connected = false, stopped = false, stop!: () => void
  const finished = new Promise<void>(resolve => { stop = () => { stopped = true; resolve() } })
  let activate!: () => void
  const activation = new Promise<void>(resolve => { activate = resolve })
  manager.on(WebSocketShardEvents.Ready, async ({ data }) => {
    if (stopped || data.user.id !== configuration.applicationId) return stop()
    if (!activated) {
      // Claim only after READY: a failed replacement never displaces a working listener.
      await redis.set(DM_GATEWAY_OWNER, listenerId, { ex: Math.ceil(durationMs / 1000) + 60 })
      activated = true; activate()
    } else if (await redis.get(DM_GATEWAY_OWNER) !== listenerId) return stop()
    connected = true
    await redis.set(DM_GATEWAY_STATUS, { listenerId, connected, updatedAt: Date.now() }, { ex: 45 })
  })
  manager.on(WebSocketShardEvents.Closed, () => { connected = false })
  manager.on(WebSocketShardEvents.Resumed, () => { connected = true })
  manager.on(WebSocketShardEvents.Error, () => { console.error('Discord DM Gateway connection error') })
  manager.on(WebSocketShardEvents.Dispatch, ({ data }) => {
    if (stopped || data.t !== 'MESSAGE_CREATE' || !directMessageSchema.safeParse(data.d).success) return
    const task = (async () => {
      await activation
      if (stopped || await redis.get(DM_GATEWAY_OWNER) !== listenerId) return
      await handleDirectMessage(data.d)
    })().catch(() => { console.error('Discord DM processing failed') }).finally(() => pending.delete(task))
    pending.add(task)
  })
  const deadline = setTimeout(stop, durationMs)
  let checking = false
  const heartbeat = setInterval(() => {
    if (checking || !activated || stopped) return
    checking = true
    void (async () => {
      if (await redis.get(DM_GATEWAY_OWNER) !== listenerId) return stop()
      await redis.set(DM_GATEWAY_STATUS, { listenerId, connected, updatedAt: Date.now() }, { ex: 45 })
    })().catch(stop).finally(() => { checking = false })
  }, 15_000)
  options.signal?.addEventListener('abort', stop, { once: true })
  try {
    if (options.signal?.aborted) return
    const information = await manager.fetchGatewayInformation()
    if (information.session_start_limit.remaining < 10) throw new Error('Discord Gateway session budget is low')
    let connectionError: unknown
    const connection = manager.connect().catch(error => { connectionError = error; stop() })
    await Promise.race([connection, finished])
    await finished
    if (connectionError) throw connectionError
  } finally {
    stop(); activate()
    clearTimeout(deadline); clearInterval(heartbeat)
    options.signal?.removeEventListener('abort', stop)
    await manager.destroy()
    // Previously accepted questions can finish; new messages belong to the replacement.
    await Promise.allSettled([...pending])
    await redis.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('DEL',KEYS[1]); redis.call('DEL',KEYS[2]); end return 1", [DM_GATEWAY_OWNER, DM_GATEWAY_STATUS], [listenerId])
  }
}
