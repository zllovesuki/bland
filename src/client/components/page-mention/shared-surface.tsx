import { useCallback, useMemo, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { PageMentionProvider } from "./provider";
import { useOnline } from "@/client/hooks/use-online";
import { useReadyShareView } from "@/client/components/share/use-share-view";

/**
 * Shared surface page-mention provider. `/s/:token` is always link-scoped —
 * resolution uses the share token, and mention navigation stays inside the
 * shared shell. If product ever wants "member opening a share link becomes
 * canonical viewer," that is a redirect out of the shared shell, not a
 * route-kind branch here.
 */
export function SharedPageMentionSurface({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const share = useReadyShareView();
  const online = useOnline();

  const scopeKey = useMemo(
    () => ["shared", share.workspaceId, share.token].join(":"),
    [share.workspaceId, share.token],
  );

  const handleNavigate = useCallback(
    (pageId: string) => {
      navigate({
        to: "/s/$token",
        params: { token: share.token },
        search: { page: pageId === share.rootPageId ? undefined : pageId },
      });
    },
    [navigate, share.rootPageId, share.token],
  );

  return (
    <PageMentionProvider
      workspaceId={share.workspaceId}
      scopeKey={scopeKey}
      shareToken={share.token}
      cacheMode="live"
      networkEnabled={online}
      navigate={handleNavigate}
    >
      {children}
    </PageMentionProvider>
  );
}
