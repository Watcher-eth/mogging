import { expect, test } from 'bun:test'

test('private course storage does not require public photo storage', () => {
  const credentials = { R2_ACCOUNT_ID: 'fixture', R2_ACCESS_KEY_ID: 'fixture', R2_SECRET_ACCESS_KEY: 'fixture' }
  for (const [settings, valid] of [
    [{ ...credentials, COURSE_R2_BUCKET_NAME: 'courses' }, true],
    [{ ...credentials, R2_BUCKET_NAME: 'photos', R2_PUBLIC_BASE_URL: 'https://images.example.com' }, true],
    [{ ...credentials, R2_BUCKET_NAME: 'photos' }, false],
    [{ R2_ACCOUNT_ID: 'fixture', COURSE_R2_BUCKET_NAME: 'courses' }, false],
  ] as const) {
    const result = Bun.spawnSync(['bun', '--no-env-file', '-e', "await import('./lib/env')"], {
      env: {
        PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: 'postgres://fixture@localhost/unused', ...settings,
      },
      stdout: 'pipe', stderr: 'pipe',
    })
    expect(result.exitCode === 0).toBe(valid)
  }
})
