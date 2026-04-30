import type { SWRConfiguration } from 'swr'
import { swrFetcher } from '@/lib/api/client'

export const swrConfig: SWRConfiguration = {
  fetcher: swrFetcher,
  revalidateOnFocus: false,
  dedupingInterval: 2_000,
  shouldRetryOnError: false,
}
