import { MutationCache, QueryClient } from '@tanstack/react-query'
import { useToastStore } from './store/toastStore'
import { parseApiError } from './utils/apiError'

function isClientError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status
  return typeof status === 'number' && status >= 400 && status < 500
}

export const queryClient: QueryClient = new QueryClient({
  mutationCache: new MutationCache({
    // Any setup change (nozzle, tank, price, staff, GST…) can move a checklist step, so the checklist is re-read.
    onSuccess: (): void => { queryClient.invalidateQueries({ queryKey: ['setup-checklist'] }) },
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.onError) return
      useToastStore.getState().addToast(parseApiError(error), 'error')
    },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => !isClientError(error) && failureCount < 1,
      staleTime: 2 * 60_000,
      gcTime: 10 * 60_000,
    },
  },
})

/** For queries that page through a whole history: refreshed by mutation invalidation, not by focus or age. */
export const FULL_HISTORY_QUERY_OPTIONS = { staleTime: 5 * 60_000, refetchOnWindowFocus: false } as const
