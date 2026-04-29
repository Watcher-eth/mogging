import { signIn } from 'next-auth/react'
import { useState, type FormEvent } from 'react'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      setError(body?.error || 'Failed to register')
      return
    }

    await signIn('credentials', {
      email,
      password,
      callbackUrl: '/',
    })
  }

  return (
    <main className="shell shell-narrow">
      <h1>Create account</h1>
      <form className="form" onSubmit={handleRegister}>
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
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
            minLength={8}
            required
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="button button-primary button-full" type="submit">
          Register
        </button>
      </form>
    </main>
  )
}
