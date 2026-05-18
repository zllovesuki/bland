import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { confirm } from "@/client/components/confirm-store";
import { useWorkspaceMembers } from "@/client/components/workspace/use-workspace-view";
import { useCopyFeedback } from "@/lib/hooks/use-copy-feedback";
import { isActionEnabled } from "@/client/lib/affordance/action-state";
import { deriveShareDialogAffordance } from "@/client/lib/affordance/share-dialog";
import { api, toApiError } from "@/client/lib/api";
import { pageSharesQueryKey, pageSharesQueryOptions } from "@/client/lib/queries/page-shares";
import { sharedInboxQueryKey } from "@/client/lib/queries/shared-inbox";
import type { PageShare, WorkspaceMember } from "@/shared/types";

import type { ShareDialogAffordance } from "@/client/lib/affordance/share-dialog";
import type { ShareLinkValue, SharePeopleValue, SharePermission, WorkspaceRole } from "./types";

interface UseShareControllerInput {
  pageId: string;
  disabled: boolean | undefined;
  open: boolean;
  workspaceRole: WorkspaceRole;
  online: boolean;
  currentUserId: string | undefined;
}

export interface ShareControllerValue {
  loading: boolean;
  creating: boolean;
  error: string | null;
  dialogAffordance: ShareDialogAffordance;
  people: SharePeopleValue;
  link: ShareLinkValue;
  deleteShare: (shareId: string) => Promise<void>;
  resetTransient: () => void;
}

export function useShareController({
  pageId,
  disabled,
  open,
  workspaceRole,
  online,
  currentUserId,
}: UseShareControllerInput): ShareControllerValue {
  const [localError, setLocalError] = useState<string | null>(null);
  const [peopleInput, setPeopleInput] = useState("");
  const [peoplePermission, setPeoplePermission] = useState<SharePermission>("view");
  const [linkPermission, setLinkPermission] = useState<SharePermission>("view");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { copiedId, copy: copyToClipboard } = useCopyFeedback<string>();
  const members = useWorkspaceMembers();
  const queryClient = useQueryClient();

  const sharesQuery = useQuery({
    ...pageSharesQueryOptions(pageId),
    enabled: open && !disabled,
  });

  const shares = useMemo(() => sharesQuery.data ?? [], [sharesQuery.data]);
  const loading = sharesQuery.isLoading;

  const appendShare = useCallback(
    (share: PageShare) => {
      queryClient.setQueryData<PageShare[]>(pageSharesQueryKey(pageId), (prev = []) => [...prev, share]);
    },
    [pageId, queryClient],
  );

  const removeShare = useCallback(
    (shareId: string) => {
      queryClient.setQueryData<PageShare[]>(pageSharesQueryKey(pageId), (prev = []) =>
        prev.filter((share) => share.id !== shareId),
      );
    },
    [pageId, queryClient],
  );

  const invalidateSharedInbox = useCallback(() => {
    // Share mutations affect the grantee's Shared With Me list. Kick the query
    // so the inbox reflects revocations/grants without a full reload.
    queryClient.invalidateQueries({ queryKey: sharedInboxQueryKey });
  }, [queryClient]);

  const createUserShareMutation = useMutation({
    mutationFn: (input: { grantee_id?: string; grantee_email?: string; permission: SharePermission }) =>
      api.shares.create(pageId, { grantee_type: "user", ...input }),
    onMutate: () => {
      setLocalError(null);
    },
    onSuccess: (share) => {
      appendShare(share);
      setPeopleInput("");
      setShowSuggestions(false);
      invalidateSharedInbox();
    },
    onError: (err) => {
      setLocalError(toApiError(err).message);
    },
  });

  const createLinkShareMutation = useMutation({
    mutationFn: (permission: SharePermission) => api.shares.create(pageId, { grantee_type: "link", permission }),
    onMutate: () => {
      setLocalError(null);
    },
    onSuccess: (share) => {
      appendShare(share);
    },
    onError: (err) => {
      setLocalError(toApiError(err).message);
    },
  });

  const deleteShareMutation = useMutation({
    mutationFn: (shareId: string) => api.shares.delete(pageId, shareId),
    onMutate: () => {
      setLocalError(null);
    },
    onSuccess: (_result, shareId) => {
      removeShare(shareId);
      invalidateSharedInbox();
    },
    onError: (err) => {
      setLocalError(toApiError(err).message);
    },
  });

  const creating = createUserShareMutation.isPending || createLinkShareMutation.isPending;
  const error = localError ?? (sharesQuery.error ? toApiError(sharesQuery.error).message : null);

  const { linkShares, userShares, shareableMembers } = useMemo(() => {
    const nextLinkShares = shares.filter((share) => share.grantee_type === "link");
    const nextUserShares = shares.filter((share) => share.grantee_type === "user");
    const sharedIds = new Set(nextUserShares.map((share) => share.grantee_id));
    const nextShareableMembers = members.filter(
      (member) => member.user_id !== currentUserId && !sharedIds.has(member.user_id),
    );
    return {
      linkShares: nextLinkShares,
      userShares: nextUserShares,
      shareableMembers: nextShareableMembers,
    };
  }, [shares, members, currentUserId]);

  const dialogAffordance = useMemo(
    () =>
      deriveShareDialogAffordance({
        workspaceRole,
        online,
        hasUserShares: userShares.length > 0,
        hasLinkShares: linkShares.length > 0,
      }),
    [workspaceRole, online, userShares.length, linkShares.length],
  );

  const filteredSuggestions = useMemo(() => {
    if (!peopleInput.trim()) return shareableMembers;
    const query = peopleInput.toLowerCase();
    return shareableMembers.filter(
      (member) =>
        (member.user?.name?.toLowerCase().includes(query) ?? false) ||
        (member.user?.email?.toLowerCase().includes(query) ?? false),
    );
  }, [peopleInput, shareableMembers]);

  const matchedMember = useMemo(() => {
    const trimmed = peopleInput.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    return (
      shareableMembers.find((member) => member.user?.email?.toLowerCase() === lower || member.user?.name === trimmed) ??
      null
    );
  }, [peopleInput, shareableMembers]);
  const hasMatchedMember = matchedMember !== null;

  const memberName = useCallback((member: WorkspaceMember): string => {
    return member.user?.name ?? member.user?.email ?? member.user_id;
  }, []);

  const granteeName = useCallback(
    (share: PageShare): string => {
      if (share.grantee_user) {
        return share.grantee_user.name || share.grantee_user.email;
      }
      const member = members.find((candidate) => candidate.user_id === share.grantee_id);
      return member ? memberName(member) : (share.grantee_id ?? "Unknown");
    },
    [members, memberName],
  );

  const openSuggestions = useCallback(() => setShowSuggestions(true), []);
  const dismissSuggestions = useCallback(() => setShowSuggestions(false), []);

  const resetTransient = useCallback(() => {
    setLocalError(null);
    setShowSuggestions(false);
  }, []);

  const selectMember = useCallback((member: WorkspaceMember) => {
    setPeopleInput(member.user?.email ?? member.user?.name ?? member.user_id);
    setShowSuggestions(false);
  }, []);

  const submitPeopleShare = useCallback(async () => {
    if (!peopleInput.trim() || creating || !isActionEnabled(dialogAffordance.createUserShare)) return;
    if (matchedMember) {
      createUserShareMutation.mutate({ grantee_id: matchedMember.user_id, permission: peoplePermission });
      return;
    }
    // Only owners/admins may invite by free-form email. The input affordance
    // already gates this for members (submit stays disabled without a matched
    // member); this guard is defense-in-depth for keyboard paths.
    if (!dialogAffordance.shareByEmail) return;
    createUserShareMutation.mutate({ grantee_email: peopleInput.trim(), permission: peoplePermission });
  }, [
    peopleInput,
    creating,
    dialogAffordance.shareByEmail,
    dialogAffordance.createUserShare,
    matchedMember,
    peoplePermission,
    createUserShareMutation,
  ]);

  const createLinkShare = useCallback(async () => {
    if (creating || !isActionEnabled(dialogAffordance.createLinkShare)) return;
    createLinkShareMutation.mutate(linkPermission);
  }, [creating, dialogAffordance.createLinkShare, linkPermission, createLinkShareMutation]);

  const deleteShare = useCallback(
    async (shareId: string) => {
      const ok = await confirm({
        title: "Remove share",
        message: "This person or link will lose access to the page.",
      });
      if (!ok) return;
      deleteShareMutation.mutate(shareId);
    },
    [deleteShareMutation],
  );

  const copyLink = useCallback(
    (share: PageShare) => {
      if (!share.link_token) return;
      copyToClipboard(share.id, `${window.location.origin}/s/${share.link_token}`);
    },
    [copyToClipboard],
  );

  const people = useMemo<SharePeopleValue>(
    () => ({
      peopleInput,
      peoplePermission,
      showSuggestions,
      userShares,
      members,
      filteredSuggestions,
      hasMatchedMember,
      memberName,
      granteeName,
      setPeopleInput,
      setPeoplePermission,
      openSuggestions,
      dismissSuggestions,
      selectMember,
      submitPeopleShare,
    }),
    [
      peopleInput,
      peoplePermission,
      showSuggestions,
      userShares,
      members,
      filteredSuggestions,
      hasMatchedMember,
      memberName,
      granteeName,
      openSuggestions,
      dismissSuggestions,
      selectMember,
      submitPeopleShare,
    ],
  );

  const link = useMemo<ShareLinkValue>(
    () => ({
      linkPermission,
      linkShares,
      copiedId,
      setLinkPermission,
      createLinkShare,
      copyLink,
    }),
    [linkPermission, linkShares, copiedId, createLinkShare, copyLink],
  );

  return useMemo<ShareControllerValue>(
    () => ({
      loading,
      creating,
      error,
      dialogAffordance,
      people,
      link,
      deleteShare,
      resetTransient,
    }),
    [loading, creating, error, dialogAffordance, people, link, deleteShare, resetTransient],
  );
}
