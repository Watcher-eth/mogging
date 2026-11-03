import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type LoginDialogContent from './login-dialog-content'

const Content = dynamic(() => import('./login-dialog-content'))

export function LoginDialog(props: ComponentProps<typeof LoginDialogContent>) {
  return props.open ? <Content {...props} /> : null
}
