import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '../api/client';

const MAX_RETRIES = 2;

/**
 * Retry only what a retry can fix: the network dropping (status 0) or the
 * server falling over (5xx). A 4xx is the request being wrong — sending it
 * again just triples the wait before the error shows.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  const status = error instanceof ApiError ? error.status : (error as { status?: number })?.status;
  if (typeof status !== 'number') return false;
  return status === 0 || status >= 500;
}

/**
 * The one QueryClient for the app. It lives in its own module so code outside
 * React (sign-out, for one) can clear the cache without a hook.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Logging is the point of this app, so data should feel live without
      // hammering a free-tier backend.
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: shouldRetry,
      refetchOnWindowFocus: true,
    },
    mutations: {
      // A retried POST can log the same meal twice.
      retry: 0,
    },
  },
});
