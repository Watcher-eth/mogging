// Isolate course fixtures, browser cookies, and build output from the normal app.
import { userInfo } from 'node:os'
const fixtures = await Bun.file('.local/course-accounts.json').json()
const taskEnv = {
  ...process.env,
  NODE_ENV: 'development',
  DATABASE_URL: process.env.COURSE_DEV_DATABASE_URL || `postgres://${encodeURIComponent(userInfo().username)}@127.0.0.1:55432/mogging_courses_dev`,
  NEXTAUTH_URL: 'http://127.0.0.1:3003',
  NEXT_DIST_DIR: '.next-course-dev',
  COURSES_ENABLED: 'true',
  COURSE_LIVE_PAYMENTS_ENABLED: 'false',
  CREATOR_ADMIN_EMAILS: fixtures.creator,
  CREATOR_ADMIN_PASSWORD: fixtures.password,
}
const server = Bun.spawn(['bun', 'node_modules/next/dist/bin/next', 'dev', '-p', '3003', '-H', '127.0.0.1'], { env: taskEnv, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' })
process.on('SIGINT', () => server.kill())
process.on('SIGTERM', () => server.kill())
process.exit(await server.exited)
