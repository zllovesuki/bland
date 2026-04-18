import { useCallback, useMemo, type ReactNode } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { PageMentionProvider } from "./provider";
import type { PageMentionCandidate } from "./types";
import { useCanonicalPageContext } from "@/client/components/workspace/use-canonical-page-context";
import { usePageSurface } from "@/client/components/page-surface/use-page-surface";
import { useOnline } from "@/client/hooks/use-online";
import { useWorkspaceStore } from "@/client/stores/workspace-store";

const EMPTY_PAGES: never[] = [];

export function CanonicalPageMentionSurface({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { workspaceSlug: string; pageId?: string };
  const { workspaceId, workspace, accessMode } = useCanonicalPageContext();
  const surface = usePageSurface();
  const online = useOnline();
  const pages = useWorkspaceStore((s) =>
    workspaceId ? (s.snapshotsByWorkspaceId[workspaceId]?.pages ?? EMPTY_PAGES) : EMPTY_PAGES,
  );

  const cacheMode = surface.state.kind === "ready" && surface.state.source === "cache" ? "cache" : "live";
  const workspaceSlug = workspace?.slug ?? params.workspaceSlug;

  const pagesById = useMemo(() => {
    const map = new Map<string, { title: string; icon: string | null }>();
    for (const page of pages) {
      if (page.archived_at) continue;
      map.set(page.id, { title: page.title, icon: page.icon });
    }
    return map;
  }, [pages]);

  const scopeKey = workspaceId ? `canonical:${workspaceId}:${accessMode ?? "unknown"}` : null;

  const lookupCachedPage = useCallback(
    (pageId: string) => {
      return pagesById.get(pageId) ?? null;
    },
    [pagesById],
  );

  const getInsertablePages = useCallback(
    (excludePageId: string | undefined): PageMentionCandidate[] => {
      const items: PageMentionCandidate[] = [];
      for (const page of pages) {
        if (page.id === excludePageId) continue;
        if (page.archived_at) continue;
        items.push({
          pageId: page.id,
          title: page.title || "Untitled",
          icon: page.icon,
        });
      }
      return items;
    },
    [pages],
  );

  const handleNavigate = useCallback(
    (pageId: string) => {
      navigate({
        to: "/$workspaceSlug/$pageId",
        params: { workspaceSlug, pageId },
      });
    },
    [navigate, workspaceSlug],
  );

  return (
    <PageMentionProvider
      workspaceId={workspaceId ?? undefined}
      scopeKey={scopeKey}
      cacheMode={cacheMode}
      networkEnabled={online}
      lookupCachedPage={lookupCachedPage}
      getInsertablePages={getInsertablePages}
      navigate={handleNavigate}
    >
      {children}
    </PageMentionProvider>
  );
}
