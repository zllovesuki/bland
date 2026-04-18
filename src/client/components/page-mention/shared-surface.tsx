import { useCallback, useMemo, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { PageMentionProvider } from "./provider";
import { useOnline } from "@/client/hooks/use-online";
import { useReadyShareView } from "@/client/components/share/use-share-view";

export function SharedPageMentionSurface({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const share = useReadyShareView();
  const online = useOnline();

  const effectiveShareToken = share.viewer.principal_type === "link" ? share.token : undefined;
  const scopeKey = useMemo(
    () =>
      [
        "shared",
        share.workspaceId,
        share.viewer.access_mode,
        share.viewer.principal_type,
        share.viewer.route_kind,
        effectiveShareToken ?? "no-link-token",
      ].join(":"),
    [
      effectiveShareToken,
      share.viewer.access_mode,
      share.viewer.principal_type,
      share.viewer.route_kind,
      share.workspaceId,
    ],
  );

  const handleNavigate = useCallback(
    (pageId: string) => {
      if (share.viewer.route_kind === "canonical" && share.viewer.workspace_slug) {
        navigate({
          to: "/$workspaceSlug/$pageId",
          params: { workspaceSlug: share.viewer.workspace_slug, pageId },
        });
        return;
      }

      navigate({
        to: "/s/$token",
        params: { token: share.token },
        search: { page: pageId === share.rootPageId ? undefined : pageId },
      });
    },
    [navigate, share.rootPageId, share.token, share.viewer.route_kind, share.viewer.workspace_slug],
  );

  return (
    <PageMentionProvider
      workspaceId={share.workspaceId}
      scopeKey={scopeKey}
      shareToken={effectiveShareToken}
      cacheMode="live"
      networkEnabled={online}
      navigate={handleNavigate}
    >
      {children}
    </PageMentionProvider>
  );
}
