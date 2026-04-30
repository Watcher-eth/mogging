import { signIn } from 'next-auth/react'
import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { apiPost, ApiClientError } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    try {
      await apiPost('/api/auth/register', { name, email, password })
    } catch (error) {
      setError(error instanceof ApiClientError ? error.message : 'Failed to register')
      return
    }

    await signIn('credentials', {
      email,
      password,
      callbackUrl: '/',
    })
  }

  return (
    <section className="mx-auto grid min-h-[calc(100vh-8rem)] w-full max-w-sm content-center py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Create account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Save analyses, shares, and ranking history.
        </p>
      </div>

      <form className="grid gap-4" onSubmit={handleRegister}>
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit">
          Register
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/auth/login">
          Login
        </Link>
      </p>
    </section>
  )
}
