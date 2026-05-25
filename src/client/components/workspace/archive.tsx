import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Archive, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { useCurrentWorkspace, useWorkspaceRole } from "./use-workspace-view";
import { replicaCommands } from "@/client/stores/db/workspace-replica";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import { api, toApiError } from "@/client/lib/api";
import { archivedPagesQueryKey, archivedPagesQueryOptions } from "@/client/lib/queries/archived-pages";
import { formatAbsoluteDate, formatRelativeDate } from "@/client/lib/format-date";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import type { ArchivedPage, Workspace } from "@/shared/types";

export function WorkspaceArchive() {
  const params = useParams({ strict: false }) as { workspaceSlug?: string };
  const navigate = useNavigate();
  const currentWorkspace = useCurrentWorkspace();
  const role = useWorkspaceRole();
  useDocumentTitle(currentWorkspace ? `Archive — ${currentWorkspace.name}` : "Archive");

  // The layout's member-only route gating already keeps non-members off this
  // route, but guests are members and reach it like Settings does. Guests
  // cannot manage the archive, so funnel them back to the workspace. Key on
  // the concrete "guest" value — role is null while the replica resolves, and
  // redirecting on null would bounce a legitimate member mid-load.
  const isGuest = role === "guest";
  useEffect(() => {
    if (isGuest && params.workspaceSlug) {
      navigate({ to: "/$workspaceSlug", params: { workspaceSlug: params.workspaceSlug }, replace: true });
    }
  }, [isGuest, params.workspaceSlug, navigate]);

  if (!currentWorkspace || isGuest) return null;

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link
        to="/$workspaceSlug"
        params={{ workspaceSlug: params.workspaceSlug ?? "" }}
        className="mb-6 flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {currentWorkspace.name}
      </Link>

      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800/50">
          <Archive className="h-5 w-5 text-zinc-400" />
        </div>
        <h1 className="text-xl font-semibold text-zinc-100">Archive</h1>
      </div>

      <ArchiveList workspace={currentWorkspace} />
    </div>
  );
}

function ArchiveList({ workspace }: { workspace: Workspace }) {
  const queryClient = useQueryClient();
  const archivedQuery = useQuery(archivedPagesQueryOptions(workspace.id));
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const archivedPages = archivedQuery.data ?? [];

  const restoreMutation = useMutation({
    mutationFn: (pageId: string) => api.pages.restore(workspace.id, pageId),
    onSuccess: async (restoredPages, pageId) => {
      await replicaCommands.upsertPages(workspace.id, restoredPages);
      queryClient.setQueryData<ArchivedPage[]>(archivedPagesQueryKey(workspace.id), (prev) =>
        prev ? prev.filter((page) => page.id !== pageId) : prev,
      );
      setRestoreError(null);
    },
    onError: (err) => {
      setRestoreError(toApiError(err).message);
    },
  });

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          {archivedQuery.isSuccess ? `${archivedPages.length} ${archivedPages.length === 1 ? "page" : "pages"}` : ""}
        </p>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          onClick={() => void archivedQuery.refetch()}
          disabled={archivedQuery.isFetching}
          aria-label="Refresh"
          title="Refresh"
          icon={
            archivedQuery.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )
          }
        />
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-800">
        {restoreError && <p className="border-b border-zinc-800 px-4 py-3 text-sm text-red-400">{restoreError}</p>}
        {archivedQuery.isLoading ? (
          <div className="flex items-center gap-2 px-4 py-4 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading archived pages
          </div>
        ) : archivedQuery.isError ? (
          <div className="px-4 py-4 text-sm text-red-400">{toApiError(archivedQuery.error).message}</div>
        ) : archivedPages.length === 0 ? (
          <div className="px-4 py-4 text-sm text-zinc-400">No archived pages.</div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {archivedPages.map((page) => (
              <ArchivePageRow
                key={page.id}
                page={page}
                restoring={restoreMutation.isPending && restoreMutation.variables === page.id}
                onRestore={() => restoreMutation.mutate(page.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ArchivePageRow({
  page,
  restoring,
  onRestore,
}: {
  page: ArchivedPage;
  restoring: boolean;
  onRestore: () => void;
}) {
  const descendantText =
    page.archived_descendant_count === 1 ? "1 subpage" : `${page.archived_descendant_count} subpages`;
  const archivedAt = page.archived_at;
  const archivedLabel = archivedAt ? `Archived ${formatRelativeDate(archivedAt)}` : "Archived";

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-200">{page.title || DEFAULT_PAGE_TITLE}</p>
        <p className="truncate text-xs text-zinc-400" title={archivedAt ? formatAbsoluteDate(archivedAt) : undefined}>
          {descendantText} · {archivedLabel}
        </p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={onRestore}
        disabled={restoring}
        icon={restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
      >
        {restoring ? "Restoring..." : "Restore"}
      </Button>
    </div>
  );
}
