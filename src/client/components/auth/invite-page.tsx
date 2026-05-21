import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { UserPlus, AlertCircle, CheckCircle, LogIn } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Skeleton } from "@/client/components/ui/skeleton";
import { api, toApiError } from "@/client/lib/api";
import { useAuthStore, selectIsAuthenticated } from "@/client/stores/auth-store";
import { ensureWorkspaceLocalOwner } from "@/client/stores/bootstrap";
import { directoryCommands } from "@/client/stores/db/workspace-directory";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import type { InvitePreview } from "@/shared/types";

function buildOidcStartUrl(token: string): string {
  const params = new URLSearchParams({ return_to: `/invite/${token}?accept=1` });
  return `/api/v1/oidc/start?${params.toString()}`;
}

export function InvitePage() {
  const { token } = useParams({ strict: false }) as { token: string };
  const { accept: acceptMarker } = useSearch({ from: "/invite/$token" });
  const navigate = useNavigate();
  useDocumentTitle("Accept Invite");
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingInvite, setIsLoadingInvite] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      try {
        const data = await api.invites.get(token);
        if (!cancelled) {
          setInvite(data);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(toApiError(err).message);
        }
      } finally {
        if (!cancelled) setIsLoadingInvite(false);
      }
    }

    loadInvite();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const acceptMutation = useMutation({
    mutationFn: () => api.invites.accept(token),
    onSuccess: async (result) => {
      useAuthStore.getState().setAuth(result.accessToken, result.user);
      await ensureWorkspaceLocalOwner(result.user.id, true);
      const workspaceData = await api.workspaces.list();
      await directoryCommands.replaceAll(workspaceData);
      const joined = workspaceData.find((w) => w.id === result.workspace_id);
      if (joined) {
        navigate({ to: "/$workspaceSlug", params: { workspaceSlug: joined.slug } });
      } else {
        navigate({ to: "/" });
      }
    },
  });

  const autoAcceptedRef = useRef(false);
  useEffect(() => {
    if (autoAcceptedRef.current) return;
    if (acceptMarker !== "1") return;
    if (!isAuthenticated) return;
    autoAcceptedRef.current = true;
    acceptMutation.mutate();
  }, [acceptMarker, isAuthenticated, acceptMutation]);

  const acceptError = acceptMutation.error ? toApiError(acceptMutation.error).message : null;

  if (isLoadingInvite) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4" aria-busy="true">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center">
            <Skeleton className="mb-3 h-10 w-10 rounded-full" />
            <Skeleton className="h-7 w-40" />
            <Skeleton className="mt-2 h-4 w-52" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
        <div className="animate-slide-up text-center">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-400" />
          <h1 className="text-lg font-semibold text-zinc-100">Invalid Invite</h1>
          <p className="mt-2 text-sm text-zinc-400">{loadError}</p>
        </div>
      </div>
    );
  }

  const oidcStartUrl = buildOidcStartUrl(token);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
      <div className="animate-slide-up w-full max-w-sm">
        <div className="mb-8 text-center">
          <CheckCircle className="mx-auto mb-3 h-10 w-10 text-accent-500" />
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-100">You&apos;re invited</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Join <span className="font-medium text-zinc-200">{invite?.workspace_name}</span> as a {invite?.role}
          </p>
        </div>

        {acceptError && (
          <div
            id="invite-error"
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{acceptError}</span>
          </div>
        )}

        {!isAuthenticated ? (
          <a
            href={oidcStartUrl}
            className="bg-accent-500 hover:bg-accent-400 focus-visible:outline-accent-400 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <LogIn className="h-4 w-4" />
            Sign in with tessera to accept
          </a>
        ) : (
          <Button
            variant="primary"
            type="button"
            disabled={acceptMutation.isPending}
            onClick={() => acceptMutation.mutate()}
            className="w-full"
            icon={
              acceptMutation.isPending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )
            }
          >
            {acceptMutation.isPending ? "Joining..." : "Accept invite"}
          </Button>
        )}
      </div>
    </div>
  );
}
