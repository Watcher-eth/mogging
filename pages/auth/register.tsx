import { signIn } from 'next-auth/react'
import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { apiPost, ApiClientError } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/router'
import { countryOptions, usRegionOptions } from '@/lib/geo/regions'

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [country, setCountry] = useState('US')
  const [state, setState] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    try {
      await apiPost('/api/auth/register', {
        name,
        email,
        password,
        country,
        state: country === 'US' ? state : null,
      })
    } catch (error) {
      setError(error instanceof ApiClientError ? error.message : 'Failed to register')
      return
    }

    const requestedNext = Array.isArray(router.query.next) ? router.query.next[0] : router.query.next
    const callbackUrl = requestedNext?.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/'
    await signIn('credentials', {
      email,
      password,
      callbackUrl,
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
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3">
          <div className="grid gap-2">
            <Label htmlFor="country">Country</Label>
            <select
              id="country"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              onChange={(event) => {
                setCountry(event.target.value)
                if (event.target.value !== 'US') setState('')
              }}
              value={country}
            >
              {countryOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="state">State / region</Label>
            <select
              id="state"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
              disabled={country !== 'US'}
              onChange={(event) => setState(event.target.value)}
              required={country === 'US'}
              value={state}
            >
              <option value="">Select</option>
              {usRegionOptions.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </div>
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
        <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/">
          Login
        </Link>
      </p>
    </section>
  )
}
