import { queryOptions } from "@tanstack/react-query";
import { api } from "@/client/lib/api";

export const sharedInboxQueryKey = ["shared-inbox"] as const;

export const sharedInboxQueryOptions = queryOptions({
  queryKey: sharedInboxQueryKey,
  queryFn: () => api.shares.sharedWithMe(),
  staleTime: 30_000,
});
