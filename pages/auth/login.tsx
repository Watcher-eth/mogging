import { getProviders, signIn } from 'next-auth/react'
import type { ClientSafeProvider, LiteralUnion } from 'next-auth/react'
import type { BuiltInProviderType } from 'next-auth/providers/index'
import { useState, type FormEvent } from 'react'

type LoginPageProps = {
  providers: Record<LiteralUnion<BuiltInProviderType, string>, ClientSafeProvider> | null
}

export default function LoginPage({ providers }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleCredentialsLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const result = await signIn('credentials', {
      email,
      password,
      callbackUrl: '/',
      redirect: false,
    })

    if (result?.error) {
      setError('Invalid email or password')
      return
    }

    window.location.href = result?.url || '/'
  }

  return (
    <main className="shell shell-narrow">
      <h1>Login</h1>
      <form className="form" onSubmit={handleCredentialsLogin}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="button button-primary button-full" type="submit">
          Login
        </button>
      </form>

      {providers?.google ? (
        <button
          className="button button-secondary button-full"
          onClick={() => signIn('google', { callbackUrl: '/' })}
          type="button"
        >
          Continue with Google
        </button>
      ) : null}
    </main>
  )
}

export async function getServerSideProps() {
  const providers = await getProviders()
  return { props: { providers } }
}
