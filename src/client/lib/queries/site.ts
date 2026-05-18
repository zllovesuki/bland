import { queryOptions } from "@tanstack/react-query";
import { api } from "@/client/lib/api";

export const siteQueryKey = (workspaceId: string) => ["workspace-site", workspaceId] as const;
export const siteRootsQueryKey = (workspaceId: string) => ["workspace-site-roots", workspaceId] as const;
export const sitePageStatusQueryKey = (workspaceId: string, pageId: string) =>
  ["workspace-site-page-status", workspaceId, pageId] as const;

export const siteQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: siteQueryKey(workspaceId),
    queryFn: () => api.site.get(workspaceId),
    staleTime: 30_000,
  });

export const siteRootsQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: siteRootsQueryKey(workspaceId),
    queryFn: () => api.site.listRoots(workspaceId),
    staleTime: 30_000,
  });

export const sitePageStatusQueryOptions = (workspaceId: string, pageId: string) =>
  queryOptions({
    queryKey: sitePageStatusQueryKey(workspaceId, pageId),
    queryFn: () => api.site.pageStatus(workspaceId, pageId),
    staleTime: 10_000,
  });
