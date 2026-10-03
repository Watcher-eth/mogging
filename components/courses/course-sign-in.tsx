import { useState, type FormEvent } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'

const LoginDialog = dynamic(() => import('@/components/app/app-shell').then(module => module.LoginDialog), { ssr: false })
export function CourseSignIn() {
  const [open, setOpen] = useState(false), router = useRouter()
  return <><button className="c-button c-button-dark" onClick={() => setOpen(true)}>Sign in</button>{open && <LoginDialog open={open} onOpenChange={setOpen} callbackUrl={router.asPath}><EmailSignIn /></LoginDialog>}</>
}

function EmailSignIn() {
  const router = useRouter(), [show, setShow] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('')
    const fields = new FormData(event.currentTarget)
    try {
      const result = await signIn('credentials', { email: fields.get('email'), password: fields.get('password'), redirect: false })
      if (!result?.ok) throw new Error('Email or password is incorrect.')
      await router.replace(router.asPath)
    } catch (error) { setError((error as Error).message); setBusy(false) }
  }
  return show ? <form className="grid gap-3" onSubmit={submit}><label className="c-field"><span>Email</span><input required name="email" type="email" autoComplete="username" /></label><label className="c-field"><span>Password</span><input required name="password" type="password" autoComplete="current-password" /></label>{error && <p role="alert">{error}</p>}<button className="c-button c-button-dark" disabled={busy}>{busy ? 'Signing in…' : 'Sign in with email'}</button></form> : <button className="c-text-link" onClick={() => setShow(true)}>Sign in with email</button>
}
