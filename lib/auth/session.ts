import type { GetServerSidePropsContext, NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from './options'

export function getAuthSession(
  ...args:
    | [GetServerSidePropsContext['req'], GetServerSidePropsContext['res']]
    | [NextApiRequest, NextApiResponse]
) {
  if (/^\/api\/(?:admin|creator)(?:[/?]|$)/.test(args[0].url || '')) {
    args[1].setHeader('Cache-Control', 'private, no-store')
  }
  return getServerSession(...args, authOptions)
}
