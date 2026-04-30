import { queryOptions } from "@tanstack/react-query";
import { api } from "@/client/lib/api";
import type { PageAncestor } from "@/shared/types";

export const pageAncestorsQueryKey = (workspaceId: string, pageId: string, shareToken?: string | null) =>
  ["page-ancestors", workspaceId, pageId, shareToken ?? null] as const;

export const pageAncestorsQueryOptions = (workspaceId: string, pageId: string, shareToken?: string | null) =>
  queryOptions<PageAncestor[]>({
    queryKey: pageAncestorsQueryKey(workspaceId, pageId, shareToken),
    queryFn: () => api.pages.ancestors(workspaceId, pageId, shareToken ?? undefined),
    staleTime: 10_000,
    retry: false,
  });
