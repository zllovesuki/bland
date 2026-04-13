import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { slugify } from "@/lib/slugify";
import { useCreateWorkspace } from "@/client/hooks/use-create-workspace";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import { api } from "@/client/lib/api";
import { resolveRootWorkspaceDecision } from "@/client/lib/root-workspace-gateway";
import { SESSION_MODES } from "@/client/lib/constants";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";

type RootViewState = "loading" | "empty" | "unavailable";

export function EmptyWorkspaceView() {
  useDocumentTitle(undefined);
  const navigate = useNavigate();
  const sessionMode = useAuthStore((s) => s.sessionMode);
  const [view, setView] = useState<RootViewState>("loading");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const { createWorkspace, isCreating } = useCreateWorkspace();

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspaceGateway() {
      setView("loading");

      const store = useWorkspaceStore.getState();
      let liveWorkspaces: Awaited<ReturnType<typeof api.workspaces.list>> | null = null;

      try {
        liveWorkspaces = await api.workspaces.list();
      } catch {
        liveWorkspaces = null;
      }

      if (cancelled) return;

      const decision = resolveRootWorkspaceDecision({
        lastVisitedWorkspaceId: store.lastVisitedWorkspaceId,
        cachedWorkspaces: store.memberWorkspaces,
        liveWorkspaces,
      });

      if (liveWorkspaces !== null) {
        store.setMemberWorkspaces(liveWorkspaces);
      }

      if (decision.kind === "redirect") {
        navigate({
          to: "/$workspaceSlug",
          params: { workspaceSlug: decision.workspace.slug },
          replace: true,
        });
        return;
      }

      if (decision.kind === "empty") {
        store.clearActiveRoute();

        // Check shared inbox: if user has pages shared with them, redirect there
        let sharedItems = store.sharedInbox;
        try {
          sharedItems = await api.shares.sharedWithMe();
          store.setSharedInbox(sharedItems);
        } catch {
          // Fall back to cached inbox
        }

        if (cancelled) return;

        if (sharedItems.length > 0) {
          navigate({ to: "/shared-with-me", replace: true });
          return;
        }

        setView("empty");
        return;
      }

      store.clearActiveRoute();

      // Offline with no cached member workspaces: check cached shared inbox
      if (store.sharedInbox.length > 0) {
        navigate({ to: "/shared-with-me", replace: true });
        return;
      }

      setView("unavailable");
    }

    loadWorkspaceGateway();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (view === "loading") {
    return (
      <div className="flex h-full items-center justify-center" aria-busy="true">
        <div className="animate-slide-up text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-zinc-500" />
          <p className="text-sm text-zinc-400">Loading workspaces...</p>
        </div>
      </div>
    );
  }

  if (view === "unavailable") {
    const isExpired = sessionMode === SESSION_MODES.EXPIRED;

    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="animate-slide-up text-center">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-400" />
          <h2 className="text-lg font-semibold text-zinc-200">Couldn't load your workspaces</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {isExpired ? "Sign in again to refresh your workspaces." : "Check your connection and try again."}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
              Retry
            </Button>
            {isExpired && (
              <Button variant="primary" size="sm" onClick={() => navigate({ to: "/login", search: { redirect: "/" } })}>
                Sign in
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="animate-slide-up text-center">
        <h2 className="text-lg font-semibold text-zinc-200">No workspaces found</h2>
        <p className="mt-1 text-sm text-zinc-500">Create a workspace or accept an invite to get started.</p>

        {showForm ? (
          <div className="mx-auto mt-4 flex w-64 flex-col gap-2">
            <input
              autoFocus
              placeholder="Workspace name"
              aria-label="Workspace name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(slugify(e.target.value));
              }}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/30"
            />
            <input
              placeholder="slug"
              aria-label="Workspace URL slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/30"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setName("");
                  setSlug("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => createWorkspace(name, slug)}
                disabled={!name.trim() || !slug.trim() || isCreating}
                icon={isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              >
                Create
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="primary"
            size="sm"
            className="mt-4"
            onClick={() => setShowForm(true)}
            icon={<Plus className="h-4 w-4" />}
          >
            Create workspace
          </Button>
        )}
      </div>
    </div>
  );
}
