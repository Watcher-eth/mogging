// Run this short-lived command every 15 minutes in the deployment's scheduler.
const url = process.env.PUSH_REMINDER_URL
const secret = process.env.CRON_SECRET
if (!url || !secret) throw new Error('Set PUSH_REMINDER_URL and CRON_SECRET')
const response = await fetch(new URL('/api/cron/push-reminders', url), {
  headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(65_000),
})
if (!response.ok) throw new Error(`Reminder job failed (${response.status}): ${await response.text()}`)
console.log(await response.json())
export {}
