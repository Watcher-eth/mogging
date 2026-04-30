import { getProviders, signIn } from 'next-auth/react'
import type { ClientSafeProvider, LiteralUnion } from 'next-auth/react'
import type { BuiltInProviderType } from 'next-auth/providers/index'
import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
    <section className="mx-auto grid min-h-[calc(100vh-8rem)] w-full max-w-sm content-center py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Login</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Continue to your analysis dashboard.
        </p>
      </div>

      <form className="grid gap-4" onSubmit={handleCredentialsLogin}>
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
            required
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit">
          Login
        </Button>
      </form>

      {providers?.google ? (
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => signIn('google', { callbackUrl: '/' })}
          type="button"
        >
          Continue with Google
        </Button>
      ) : null}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        No account?{' '}
        <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/auth/register">
          Register
        </Link>
      </p>
    </section>
  )
}

export async function getServerSideProps() {
  const providers = await getProviders()
  return { props: { providers } }
}
