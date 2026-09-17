// Keep the original smoke command, with one owner for payment test coverage.
if (process.env.SCAN_CREDIT_TEST !== '1') throw new Error('Set SCAN_CREDIT_TEST=1 and use a disposable local PostgreSQL server')
process.env.SCAN_TEST_DATABASE_URL = process.env.DATABASE_URL
await import('../tests/scan-allowances')
export {}
