import { connect } from 'node:http2'
import { importPKCS8, SignJWT } from 'jose'

let cachedToken: { token: string; expires: number } | undefined

function requirePushConfiguration() {
  for (const key of ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_PRIVATE_KEY']) {
    if (!process.env[key]?.trim()) throw new Error(`Missing ${key}`)
  }
}

async function providerToken() {
  requirePushConfiguration()
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.token
  const key = await importPKCS8(process.env.APNS_PRIVATE_KEY!.replace(/\\n/g, '\n'), 'ES256')
  const token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: process.env.APNS_KEY_ID! })
    .setIssuer(process.env.APNS_TEAM_ID!).setIssuedAt().sign(key)
  cachedToken = { token, expires: Date.now() + 50 * 60_000 }
  return token
}

export async function prepareApplePush() { await providerToken() }

export async function sendApplePush(input: {
  token: string; environment: string; title: string; body: string; target: string; collapseId: string
}) {
  const authorization = await providerToken()
  return new Promise<{ status: number; reason?: string }>((resolve, reject) => {
    const client = connect(input.environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com')
    const finish = (error?: Error, result?: { status: number; reason?: string }) => {
      clearTimeout(timeout)
      client.destroy()
      if (error) reject(error)
      else resolve(result!)
    }
    const timeout = setTimeout(() => finish(new Error('APNs request timed out')), 10_000)
    client.on('error', finish)
    const request = client.request({
      ':method': 'POST', ':path': `/3/device/${input.token}`,
      authorization: `bearer ${authorization}`, 'apns-topic': 'app.mogging.scan',
      'apns-push-type': 'alert', 'apns-priority': '10',
      // Never queue a completed task or yesterday's reminder for later delivery.
      'apns-expiration': '0', 'apns-collapse-id': input.collapseId,
    })
    let status = 0
    let body = ''
    request.on('response', headers => { status = Number(headers[':status']) })
    request.setEncoding('utf8')
    request.on('data', chunk => { body += chunk })
    request.on('error', finish)
    request.on('end', () => {
      let reason: string | undefined
      try { reason = JSON.parse(body).reason } catch { /* Successful responses have no body. */ }
      finish(undefined, { status, reason })
    })
    request.end(JSON.stringify({ aps: { alert: { title: input.title, body: input.body }, sound: 'default' }, target: input.target }))
  })
}
