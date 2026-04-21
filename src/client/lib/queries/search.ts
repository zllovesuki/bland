import { queryOptions } from "@tanstack/react-query";
import { api } from "@/client/lib/api";

export const searchQueryOptions = (workspaceId: string | null, query: string) =>
  queryOptions({
    queryKey: ["search", workspaceId, query] as const,
    queryFn: () => {
      if (!workspaceId) return [];
      return api.search(workspaceId, query);
    },
    enabled: !!workspaceId && query.trim().length >= 3,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
