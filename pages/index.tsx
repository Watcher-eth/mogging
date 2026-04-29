import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="shell">
      <p className="eyebrow">Mogging backend rebuild</p>
      <h1>Clean backend foundation first.</h1>
      <p className="lede">
        This scaffold uses the Pages Router, NextAuth, PostgreSQL, and Drizzle. Product UI comes after the backend
        contracts are stable.
      </p>
      <div className="actions">
        <Link className="button button-primary" href="/auth/login">
          Login
        </Link>
        <Link className="button button-secondary" href="/auth/register">
          Register
        </Link>
      </div>
    </main>
  )
}
