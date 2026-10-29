import { randomUUID } from 'node:crypto'
import { Message, type QueueEntry, type SerializedMessage, type StateAdapter } from 'chat'
import type { Redis } from '@upstash/redis'

/** Chat SDK state over the app's existing Upstash REST connection (no second Redis service). */
export function createDiscordState(redis: Redis): StateAdapter {
  const key = (value: string) => `creator-discord:sdk:${value}`
  const serializeQueue = (entry: QueueEntry) => ({ ...entry, message: entry.message.toJSON() })
  return {
    async connect() {}, async disconnect() {},
    async get<T>(name: string) { return redis.get<T>(key(name)) },
    async set<T>(name: string, value: T, ttlMs = 1_800_000) { await redis.set(key(name), value, { px: ttlMs }) },
    async setIfNotExists(name, value, ttlMs = 1_800_000) { return await redis.set(key(name), value, { px: ttlMs, nx: true }) === 'OK' },
    async delete(name) { await redis.del(key(name)) },
    async subscribe(id) { await redis.set(key(`sub:${id}`), true) },
    async unsubscribe(id) { await redis.del(key(`sub:${id}`)) },
    async isSubscribed(id) { return Boolean(await redis.get(key(`sub:${id}`))) },
    async acquireLock(threadId, ttlMs) {
      const token = randomUUID()
      return await redis.set(key(`lock:${threadId}`), token, { nx: true, px: ttlMs }) === 'OK' ? { threadId, token, expiresAt: Date.now() + ttlMs } : null
    },
    async releaseLock(lock) { await redis.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", [key(`lock:${lock.threadId}`)], [lock.token]) },
    async forceReleaseLock(id) { await redis.del(key(`lock:${id}`)) },
    async extendLock(lock, ttlMs) { return Number(await redis.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE',KEYS[1],ARGV[2]) end return 0", [key(`lock:${lock.threadId}`)], [lock.token, ttlMs])) === 1 },
    async appendToList(name, value, options = {}) {
      await redis.eval("redis.call('RPUSH',KEYS[1],ARGV[1]); redis.call('LTRIM',KEYS[1],-tonumber(ARGV[2]),-1); redis.call('PEXPIRE',KEYS[1],ARGV[3]); return 1", [key(name)], [JSON.stringify(value), options.maxLength ?? 50, options.ttlMs ?? 1_800_000])
    },
    async getList<T>(name: string) { return redis.lrange<T>(key(name), 0, -1) },
    async enqueue(id, entry, maxSize) {
      return Number(await redis.eval("redis.call('RPUSH',KEYS[1],ARGV[1]); redis.call('LTRIM',KEYS[1],-tonumber(ARGV[2]),-1); redis.call('PEXPIRE',KEYS[1],ARGV[3]); return redis.call('LLEN',KEYS[1])", [key(`queue:${id}`)], [JSON.stringify(serializeQueue(entry)), maxSize, Math.max(1, entry.expiresAt - Date.now())]))
    },
    async dequeue(id) {
      const entry = await redis.lpop<{ enqueuedAt: number; expiresAt: number; message: SerializedMessage }>(key(`queue:${id}`))
      return entry ? { ...entry, message: Message.fromJSON(entry.message) } : null
    },
    async queueDepth(id) { return redis.llen(key(`queue:${id}`)) },
  }
}
