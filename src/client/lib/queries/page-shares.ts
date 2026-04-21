import { queryOptions } from "@tanstack/react-query";
import { api } from "@/client/lib/api";

export const pageSharesQueryKey = (pageId: string) => ["page-shares", pageId] as const;

export const pageSharesQueryOptions = (pageId: string) =>
  queryOptions({
    queryKey: pageSharesQueryKey(pageId),
    queryFn: () => api.shares.list(pageId),
    staleTime: 30_000,
  });
