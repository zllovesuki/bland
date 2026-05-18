import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useCopyFeedback } from "@/lib/hooks/use-copy-feedback";
import { api, toApiError } from "@/client/lib/api";
import {
  sitePageStatusQueryKey,
  sitePageStatusQueryOptions,
  siteQueryKey,
  siteQueryOptions,
} from "@/client/lib/queries/site";
import type { PageKind } from "@/shared/types";

import type { SitePublishValue } from "./types";

interface UseSitePublishInput {
  pageId: string;
  workspaceId: string;
  pageKind: PageKind;
  canManageSite: boolean;
  canViewPagePublishStatus: boolean;
  open: boolean;
}

type UpdateAction = "slug" | "site-toggle" | "set-home";

function isSitesDisabledError(err: unknown): boolean {
  return err ? toApiError(err).error === "sites_disabled" : false;
}

function queryErrorMessage(err: unknown): string | null {
  if (!err || isSitesDisabledError(err)) return null;
  return toApiError(err).message;
}

export function useSitePublishController({
  pageId,
  workspaceId,
  pageKind,
  canManageSite,
  canViewPagePublishStatus,
  open,
}: UseSitePublishInput): SitePublishValue {
  const queryClient = useQueryClient();
  const { copiedId, copy: copyToClipboard } = useCopyFeedback<string>();
  const [slugDraft, setSlugDraft] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  // The update endpoint serves three distinct intents (slug save, site
  // enable/disable toggle, set-as-home). UI needs to spin only the button
  // that triggered the update. A single discriminator keeps the controller
  // small and avoids three parallel mutations against the same endpoint.
  const [updateAction, setUpdateAction] = useState<UpdateAction | null>(null);
  // Tracker fields for render-phase state adjustments. Keyed on workspaceId
  // so a draft typed in workspace A cannot be PATCHed against workspace B
  // after the dialog is reopened in a different workspace. The seed marker
  // remembers which server slug we already accepted so we do not clobber a
  // user edit once the server response lands.
  const [keyedWorkspaceId, setKeyedWorkspaceId] = useState(workspaceId);
  const [seedFromServer, setSeedFromServer] = useState("");

  // Site config is admin-only on the worker. Members would hit 403, so gate
  // the query by entitlement and let the member surface render from page
  // status alone.
  const siteQuery = useQuery({ ...siteQueryOptions(workspaceId), enabled: open && canManageSite });
  const statusQuery = useQuery({
    ...sitePageStatusQueryOptions(workspaceId, pageId),
    enabled: open && canViewPagePublishStatus && pageKind === "doc",
  });

  const serverSlug = siteQuery.data?.site?.slug ?? "";
  const siteRow = siteQuery.data?.site ?? null;
  const sitePublished = !!siteRow?.published_at;

  // Render-phase adjustments (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  // Cheaper than a useEffect cascade and avoids the lint rule against
  // setState-inside-useEffect.
  if (keyedWorkspaceId !== workspaceId) {
    setKeyedWorkspaceId(workspaceId);
    setSlugDraft("");
    setSeedFromServer("");
    setLocalError(null);
  } else if (open && slugDraft === "" && serverSlug !== "" && seedFromServer !== serverSlug) {
    setSlugDraft(serverSlug);
    setSeedFromServer(serverSlug);
  }

  const invalidatePublishState = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: siteQueryKey(workspaceId) });
    queryClient.invalidateQueries({ queryKey: sitePageStatusQueryKey(workspaceId, pageId) });
  }, [queryClient, workspaceId, pageId]);

  const updateMutation = useMutation({
    mutationFn: (body: { slug?: string; published?: boolean; home_page_id?: string | null }) =>
      api.site.update(workspaceId, body),
    onMutate: () => setLocalError(null),
    onSuccess: () => invalidatePublishState(),
    onError: (err) => setLocalError(toApiError(err).message),
    onSettled: () => setUpdateAction(null),
  });

  const publishMutation = useMutation({
    mutationFn: () => api.site.addRoot(workspaceId, pageId),
    onMutate: () => setLocalError(null),
    onSuccess: () => invalidatePublishState(),
    onError: (err) => setLocalError(toApiError(err).message),
  });

  const unpublishMutation = useMutation({
    mutationFn: () => api.site.removeRoot(workspaceId, pageId),
    onMutate: () => setLocalError(null),
    onSuccess: () => invalidatePublishState(),
    onError: (err) => setLocalError(toApiError(err).message),
  });

  const saveSiteSlug = useCallback(
    async (slug: string) => {
      setUpdateAction("slug");
      // First-time slug save also publishes the site so the user does not
      // have to make two clicks to bring a new site online.
      const published = sitePublished || !siteRow;
      await updateMutation.mutateAsync({ slug, published });
    },
    [updateMutation, sitePublished, siteRow],
  );

  const toggleSitePublished = useCallback(async () => {
    setUpdateAction("site-toggle");
    await updateMutation.mutateAsync({ published: !sitePublished });
  }, [updateMutation, sitePublished]);

  const publishPage = useCallback(async () => {
    await publishMutation.mutateAsync();
  }, [publishMutation]);

  const unpublishPage = useCallback(async () => {
    await unpublishMutation.mutateAsync();
  }, [unpublishMutation]);

  const setHomePage = useCallback(async () => {
    setUpdateAction("set-home");
    await updateMutation.mutateAsync({ home_page_id: pageId });
  }, [updateMutation, pageId]);

  const publicUrl = statusQuery.data?.public_url ?? null;
  const copyPublicUrl = useCallback(() => {
    if (!publicUrl) return;
    copyToClipboard(pageId, publicUrl);
  }, [publicUrl, copyToClipboard, pageId]);

  const slugSavePending = updateMutation.isPending && updateAction === "slug";
  const siteTogglePending = updateMutation.isPending && updateAction === "site-toggle";
  const setHomePending = updateMutation.isPending && updateAction === "set-home";
  const publishPending = publishMutation.isPending;
  const unpublishPending = unpublishMutation.isPending;
  const saving = slugSavePending || siteTogglePending || setHomePending || publishPending || unpublishPending;

  const loading = siteQuery.isLoading || (pageKind === "doc" && statusQuery.isLoading);
  const featureDisabled = isSitesDisabledError(siteQuery.error) || isSitesDisabledError(statusQuery.error);

  const error = useMemo(() => {
    if (localError) return localError;
    if (featureDisabled) return null;
    return queryErrorMessage(siteQuery.error) ?? queryErrorMessage(statusQuery.error);
  }, [localError, featureDisabled, siteQuery.error, statusQuery.error]);

  return useMemo<SitePublishValue>(
    () => ({
      pageId,
      workspaceId,
      site: siteQuery.data,
      pageStatus: statusQuery.data,
      loading,
      saving,
      slugSavePending,
      siteTogglePending,
      setHomePending,
      publishPending,
      unpublishPending,
      featureDisabled,
      error,
      slugDraft,
      setSlugDraft,
      saveSiteSlug,
      toggleSitePublished,
      publishPage,
      unpublishPage,
      setHomePage,
      copyPublicUrl,
      copied: copiedId === pageId,
    }),
    [
      pageId,
      workspaceId,
      siteQuery.data,
      statusQuery.data,
      loading,
      saving,
      slugSavePending,
      siteTogglePending,
      setHomePending,
      publishPending,
      unpublishPending,
      featureDisabled,
      error,
      slugDraft,
      saveSiteSlug,
      toggleSitePublished,
      publishPage,
      unpublishPage,
      setHomePage,
      copyPublicUrl,
      copiedId,
    ],
  );
}
