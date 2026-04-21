import { QueryClient } from "@tanstack/react-query";

/**
 * Shared QueryClient for orthogonal server-state reads (shared inbox, search).
 * Workspace/page state stays in Zustand and the ActivePageProvider — Query is
 * scoped to surfaces where built-in dedup + window-focus/reconnect refresh is
 * a pure win and doesn't compete with the durable snapshot store.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});
