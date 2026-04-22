import { queryOptions } from "@tanstack/react-query";
import { api } from "@/client/lib/api";
import type { SharedPagesResponse } from "@/shared/types";

export const sharedInboxQueryKey = ["shared-inbox"] as const;

export const sharedInboxQueryOptions = queryOptions<SharedPagesResponse>({
  queryKey: sharedInboxQueryKey,
  queryFn: () => api.shares.sharedWithMe(),
  staleTime: 30_000,
});
