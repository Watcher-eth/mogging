import Head from 'next/head'
import type { ComponentProps } from 'react'
import { memberPage } from '@/lib/users/member-pages'
import MemberView from '@/components/members/protocol'

export const getServerSideProps = memberPage('protocol')

export default function MemberPage(props: ComponentProps<typeof MemberView>) {
  return <>
    <Head><title>Protocol | Mogging</title><meta name="robots" content="noindex, nofollow" /></Head>
    <MemberView {...props} />
  </>
}
