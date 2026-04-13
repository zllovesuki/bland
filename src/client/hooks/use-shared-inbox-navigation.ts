import { useCallback } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { getSharedInboxReturnTo, withSharedInboxReturnTo } from "@/client/lib/shared-inbox-navigation";
import { useWorkspaceStore } from "@/client/stores/workspace-store";

interface SharedInboxNavigationOptions {
  returnTo?: string | null;
}

export function useSharedInboxNavigation(options?: SharedInboxNavigationOptions) {
  const navigate = useNavigate();
  const location = useLocation();
  const memberWorkspaceCount = useWorkspaceStore((s) => s.memberWorkspaces.length);
  const isSharedInbox = location.pathname === "/shared-with-me";
  const returnTo = options?.returnTo ?? getSharedInboxReturnTo(location.state);
  const canLeaveSharedInbox = Boolean(returnTo || memberWorkspaceCount > 0);
  const backLabel = returnTo ? "Back" : memberWorkspaceCount > 0 ? "Back to workspaces" : null;

  const openSharedInbox = useCallback(() => {
    navigate({
      to: "/shared-with-me",
      state: (prev) => withSharedInboxReturnTo(prev, location.href),
    });
  }, [location.href, navigate]);

  const leaveSharedInbox = useCallback(() => {
    if (returnTo) {
      navigate({ href: returnTo, replace: true });
      return;
    }

    if (memberWorkspaceCount > 0) {
      navigate({ to: "/", replace: true });
    }
  }, [memberWorkspaceCount, navigate, returnTo]);

  const toggleSharedInbox = useCallback(() => {
    if (isSharedInbox) {
      leaveSharedInbox();
      return;
    }

    openSharedInbox();
  }, [isSharedInbox, leaveSharedInbox, openSharedInbox]);

  return {
    backLabel,
    canLeaveSharedInbox,
    isSharedInbox,
    leaveSharedInbox,
    toggleSharedInbox,
  };
}
