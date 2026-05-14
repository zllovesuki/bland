import { queryOptions } from "@tanstack/react-query";
import { api } from "@/client/lib/api";

export const shareResolveQueryKey = (token: string, sessionMode: string, userId: string | null) =>
  ["share-resolve", token, sessionMode, userId] as const;

export const shareResolveQueryOptions = (token: string, sessionMode: string, userId: string | null) =>
  queryOptions({
    queryKey: shareResolveQueryKey(token, sessionMode, userId),
    queryFn: () => api.shares.resolve(token),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false,
  });
