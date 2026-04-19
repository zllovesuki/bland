import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Share2, Link2, Copy, Check, Trash2, Users, Loader2, ChevronDown } from "lucide-react";
import { useClickOutside } from "@/client/hooks/use-click-outside";
import { useCopyFeedback } from "@/client/hooks/use-copy-feedback";
import { api, toApiError } from "@/client/lib/api";
import { useWorkspaceMembers } from "@/client/components/workspace/use-workspace-view";
import { useAuthStore } from "@/client/stores/auth-store";
import { getMyRole } from "@/client/lib/workspace-role";
import { confirm } from "@/client/components/confirm";
import { Skeleton } from "@/client/components/ui/skeleton";
import { deriveShareDialogAffordance, deriveShareDialogRowAffordance } from "@/client/lib/affordance/share-dialog";
import { isActionEnabled, isActionVisible } from "@/client/lib/affordance/action-state";
import { useOnline } from "@/client/hooks/use-online";
import { createRequestGuard } from "@/client/lib/request-guard";
import type { PageShare, WorkspaceMember } from "@/shared/types";
import type { ShareDialogAffordance } from "@/client/lib/affordance/share-dialog";

type SharePermission = "view" | "edit";
type WorkspaceRole = "owner" | "admin" | "member" | "guest" | "none";

function PermissionSelect({ value, onChange }: { value: SharePermission; onChange: (v: SharePermission) => void }) {
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SharePermission)}
        className="appearance-none rounded-md border border-zinc-700 bg-zinc-800 py-1 pl-2 pr-6 text-sm text-zinc-300 outline-none focus:border-zinc-600"
      >
        <option value="view">View</option>
        <option value="edit">Edit</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
    </div>
  );
}

interface ShareDialogProps {
  pageId: string;
  disabled?: boolean;
  title?: string;
}

interface ShareDialogShellValue {
  disabled: boolean;
  title: string | undefined;
  open: boolean;
  loading: boolean;
  creating: boolean;
  error: string | null;
  dialogAffordance: ShareDialogAffordance;
  workspaceRole: WorkspaceRole;
  online: boolean;
  currentUserId: string | undefined;
  toggleOpen: () => void;
  close: () => void;
  deleteShare: (shareId: string) => Promise<void>;
}

interface SharePeopleValue {
  peopleInput: string;
  peoplePermission: SharePermission;
  showSuggestions: boolean;
  userShares: PageShare[];
  members: WorkspaceMember[];
  filteredSuggestions: WorkspaceMember[];
  memberName: (member: WorkspaceMember) => string;
  granteeName: (share: PageShare) => string;
  setPeopleInput: (value: string) => void;
  setPeoplePermission: (value: SharePermission) => void;
  openSuggestions: () => void;
  dismissSuggestions: () => void;
  selectMember: (member: WorkspaceMember) => void;
  submitPeopleShare: () => Promise<void>;
}

interface ShareLinkValue {
  linkPermission: SharePermission;
  linkShares: PageShare[];
  copiedId: string | null;
  setLinkPermission: (value: SharePermission) => void;
  createLinkShare: () => Promise<void>;
  copyLink: (share: PageShare) => void;
}

const ShareDialogShellContext = createContext<ShareDialogShellValue | null>(null);
const SharePeopleContext = createContext<SharePeopleValue | null>(null);
const ShareLinkContext = createContext<ShareLinkValue | null>(null);

function useShareDialogShell(): ShareDialogShellValue {
  const ctx = useContext(ShareDialogShellContext);
  if (!ctx) throw new Error("useShareDialogShell must be used inside ShareDialog");
  return ctx;
}

function useSharePeople(): SharePeopleValue {
  const ctx = useContext(SharePeopleContext);
  if (!ctx) throw new Error("useSharePeople must be used inside ShareDialog");
  return ctx;
}

function useShareLink(): ShareLinkValue {
  const ctx = useContext(ShareLinkContext);
  if (!ctx) throw new Error("useShareLink must be used inside ShareDialog");
  return ctx;
}

interface ShareDialogSlices {
  shell: ShareDialogShellValue;
  people: SharePeopleValue;
  link: ShareLinkValue;
}

function useShareDialogController({ pageId, disabled, title }: ShareDialogProps): ShareDialogSlices {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<PageShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peopleInput, setPeopleInput] = useState("");
  const [peoplePermission, setPeoplePermission] = useState<SharePermission>("view");
  const [linkPermission, setLinkPermission] = useState<SharePermission>("view");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { copiedId, copy: copyToClipboard } = useCopyFeedback<string>();
  const members = useWorkspaceMembers();
  const user = useAuthStore((s) => s.user);
  const online = useOnline();
  const workspaceRole: WorkspaceRole = getMyRole(members, user) ?? "none";
  const currentUserId = user?.id;
  const activeRef = useRef(true);
  const loadEpochRef = useRef(0);
  const pageIdRef = useRef(pageId);
  const openRef = useRef(open);
  pageIdRef.current = pageId;
  openRef.current = open;

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const request = createRequestGuard(loadEpochRef, activeRef);
    setLoading(true);
    setError(null);

    api.shares
      .list(pageId)
      .then((nextShares) => {
        if (!request.isCurrent()) return;
        setShares(nextShares);
      })
      .catch((err) => {
        if (!request.isCurrent()) return;
        setError(toApiError(err).message);
      })
      .finally(() => {
        if (!request.isCurrent()) return;
        setLoading(false);
      });

    return () => {
      request.cancel();
    };
  }, [open, pageId]);

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

  const close = useCallback(() => {
    setOpen(false);
    setShowSuggestions(false);
  }, []);

  const toggleOpen = useCallback(() => {
    if (disabled) return;
    if (!openRef.current) {
      setShares([]);
      setError(null);
      setLoading(true);
      setShowSuggestions(false);
    }
    setOpen((current) => !current);
  }, [disabled]);

  const openSuggestions = useCallback(() => setShowSuggestions(true), []);
  const dismissSuggestions = useCallback(() => setShowSuggestions(false), []);

  const selectMember = useCallback((member: WorkspaceMember) => {
    setPeopleInput(member.user?.email ?? member.user?.name ?? member.user_id);
    setShowSuggestions(false);
  }, []);

  const submitPeopleShare = useCallback(async () => {
    if (!peopleInput.trim() || creating || !isActionEnabled(dialogAffordance.createUserShare)) return;
    const capturedPageId = pageIdRef.current;
    setCreating(true);
    setError(null);
    try {
      const matchedMember = shareableMembers.find(
        (member) =>
          member.user?.email?.toLowerCase() === peopleInput.trim().toLowerCase() ||
          member.user?.name === peopleInput.trim(),
      );
      const share = matchedMember
        ? await api.shares.create(capturedPageId, {
            grantee_type: "user",
            grantee_id: matchedMember.user_id,
            permission: peoplePermission,
          })
        : await api.shares.create(capturedPageId, {
            grantee_type: "user",
            grantee_email: peopleInput.trim(),
            permission: peoplePermission,
          });
      if (!activeRef.current || pageIdRef.current !== capturedPageId) return;
      setShares((prev) => [...prev, share]);
      setPeopleInput("");
      setShowSuggestions(false);
    } catch (err) {
      if (!activeRef.current || pageIdRef.current !== capturedPageId) return;
      setError(toApiError(err).message);
    } finally {
      if (!activeRef.current || pageIdRef.current !== capturedPageId) return;
      setCreating(false);
    }
  }, [peopleInput, creating, dialogAffordance.createUserShare, shareableMembers, peoplePermission]);

  const createLinkShare = useCallback(async () => {
    if (creating || !isActionEnabled(dialogAffordance.createLinkShare)) return;
    const capturedPageId = pageIdRef.current;
    setCreating(true);
    setError(null);
    try {
      const share = await api.shares.create(capturedPageId, {
        grantee_type: "link",
        permission: linkPermission,
      });
      if (!activeRef.current || pageIdRef.current !== capturedPageId) return;
      setShares((prev) => [...prev, share]);
    } catch (err) {
      if (!activeRef.current || pageIdRef.current !== capturedPageId) return;
      setError(toApiError(err).message);
    } finally {
      if (!activeRef.current || pageIdRef.current !== capturedPageId) return;
      setCreating(false);
    }
  }, [creating, dialogAffordance.createLinkShare, linkPermission]);

  const deleteShare = useCallback(async (shareId: string) => {
    const ok = await confirm({
      title: "Remove share",
      message: "This person or link will lose access to the page.",
    });
    if (!ok) return;
    const capturedPageId = pageIdRef.current;
    try {
      await api.shares.delete(capturedPageId, shareId);
      if (!activeRef.current || pageIdRef.current !== capturedPageId) return;
      setShares((prev) => prev.filter((share) => share.id !== shareId));
    } catch (err) {
      if (!activeRef.current || pageIdRef.current !== capturedPageId) return;
      setError(toApiError(err).message);
    }
  }, []);

  const copyLink = useCallback(
    (share: PageShare) => {
      if (!share.link_token) return;
      copyToClipboard(share.id, `${window.location.origin}/s/${share.link_token}`);
    },
    [copyToClipboard],
  );

  const shell = useMemo<ShareDialogShellValue>(
    () => ({
      disabled: disabled ?? false,
      title,
      open,
      loading,
      creating,
      error,
      dialogAffordance,
      workspaceRole,
      online,
      currentUserId,
      toggleOpen,
      close,
      deleteShare,
    }),
    [
      disabled,
      title,
      open,
      loading,
      creating,
      error,
      dialogAffordance,
      workspaceRole,
      online,
      currentUserId,
      toggleOpen,
      close,
      deleteShare,
    ],
  );

  const people = useMemo<SharePeopleValue>(
    () => ({
      peopleInput,
      peoplePermission,
      showSuggestions,
      userShares,
      members,
      filteredSuggestions,
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

  return { shell, people, link };
}

function ShareDialogTrigger() {
  const { disabled, title, toggleOpen } = useShareDialogShell();

  return (
    <button
      onClick={toggleOpen}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Share2 className="h-3.5 w-3.5" />
      Share
    </button>
  );
}

function ShareDialogPanel() {
  const { open, close, loading, error, dialogAffordance } = useShareDialogShell();
  const panelRef = useRef<HTMLDivElement>(null);

  useClickOutside(panelRef, close, open);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="animate-scale-fade origin-top-right absolute right-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-zinc-700 bg-zinc-800 p-3 shadow-lg"
    >
      {loading ? (
        <div aria-busy="true">
          <div className="mb-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Skeleton className="h-3 w-3 rounded-sm" />
              <Skeleton className="h-3.5 w-14" />
            </div>
            <div className="mb-2 flex items-center gap-1.5">
              <Skeleton className="h-8 flex-1 rounded-md" />
              <Skeleton className="h-8 w-20 rounded-md" />
              <Skeleton className="h-8 w-12 rounded-md" />
            </div>
            <div className="space-y-1">
              <Skeleton className="h-7 w-full rounded-md" />
              <Skeleton className="h-7 w-full rounded-md" />
            </div>
          </div>
          <div className="border-t border-zinc-700/50 pt-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Skeleton className="h-3 w-3 rounded-sm" />
              <Skeleton className="h-3.5 w-10" />
            </div>
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        </div>
      ) : (
        <>
          {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
          {dialogAffordance.showPeopleSection && <SharePeopleSection />}
          {dialogAffordance.showLinkSection && <ShareLinkSection />}
        </>
      )}
    </div>
  );
}

function SharePeopleSection() {
  const { creating, dialogAffordance, workspaceRole, online, currentUserId, deleteShare } = useShareDialogShell();
  const {
    peopleInput,
    peoplePermission,
    showSuggestions,
    userShares,
    members,
    filteredSuggestions,
    memberName,
    granteeName,
    setPeopleInput,
    setPeoplePermission,
    openSuggestions,
    selectMember,
    submitPeopleShare,
  } = useSharePeople();

  return (
    <div className="mb-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-400">
        <Users className="h-3 w-3" />
        People
      </p>
      <div className="relative mb-2 flex items-center gap-1.5">
        <input
          type="text"
          placeholder="Name or email..."
          aria-label="Search people to share with"
          value={peopleInput}
          onChange={(e) => {
            setPeopleInput(e.target.value);
            openSuggestions();
          }}
          onFocus={openSuggestions}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void submitPeopleShare();
            }
          }}
          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 py-1.5 pl-2 text-sm text-zinc-300 outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/30"
        />
        <PermissionSelect value={peoplePermission} onChange={setPeoplePermission} />
        <button
          onClick={() => void submitPeopleShare()}
          disabled={creating || !peopleInput.trim() || !isActionEnabled(dialogAffordance.createUserShare)}
          title={
            dialogAffordance.createUserShare.kind === "disabled" ? dialogAffordance.createUserShare.reason : undefined
          }
          className="shrink-0 rounded-md px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Share"}
        </button>
        {showSuggestions && filteredSuggestions.length > 0 && peopleInput.trim() && (
          <div className="animate-scale-fade origin-top-left absolute left-0 top-full z-10 mt-1 max-h-32 w-full overflow-y-auto rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-lg">
            {filteredSuggestions.map((member) => (
              <button
                key={member.user_id}
                onClick={() => selectMember(member)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
              >
                <span className="truncate">{memberName(member)}</span>
                {member.user?.email && member.user.name && (
                  <span className="truncate text-zinc-500">{member.user.email}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      {userShares.length > 0 ? (
        <div className="space-y-1">
          {userShares.map((share) => (
            <ShareUserRow
              key={share.id}
              share={share}
              label={granteeName(share)}
              workspaceRole={workspaceRole}
              online={online}
              currentUserId={currentUserId}
              granteeIsWorkspaceMember={members.some((member) => member.user_id === share.grantee_id)}
              onDelete={() => void deleteShare(share.id)}
            />
          ))}
        </div>
      ) : (
        <p className="px-2 text-sm text-zinc-400">No people shares</p>
      )}
    </div>
  );
}

function ShareLinkSection() {
  const { creating, dialogAffordance, workspaceRole, online, currentUserId, deleteShare } = useShareDialogShell();
  const { linkPermission, linkShares, copiedId, setLinkPermission, createLinkShare, copyLink } = useShareLink();

  return (
    <div className={dialogAffordance.showPeopleSection ? "border-t border-zinc-700/50 pt-3" : ""}>
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-400">
        <Link2 className="h-3 w-3" />
        Link
      </p>
      {isActionVisible(dialogAffordance.createLinkShare) && (
        <div className="mb-2 flex items-center gap-1.5">
          <button
            onClick={() => void createLinkShare()}
            disabled={creating || !isActionEnabled(dialogAffordance.createLinkShare)}
            title={
              dialogAffordance.createLinkShare.kind === "disabled" ? dialogAffordance.createLinkShare.reason : undefined
            }
            className="flex flex-1 items-center gap-2 rounded-md border border-dashed border-zinc-700 px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Create link
          </button>
          <PermissionSelect value={linkPermission} onChange={setLinkPermission} />
        </div>
      )}
      {linkShares.length > 0 ? (
        <div className="space-y-1">
          {linkShares.map((share) => (
            <ShareLinkRow
              key={share.id}
              share={share}
              copiedId={copiedId}
              workspaceRole={workspaceRole}
              online={online}
              currentUserId={currentUserId}
              onCopy={() => copyLink(share)}
              onDelete={() => void deleteShare(share.id)}
            />
          ))}
        </div>
      ) : (
        isActionVisible(dialogAffordance.createLinkShare) && (
          <p className="px-2 text-sm text-zinc-400">No link shares</p>
        )
      )}
    </div>
  );
}

function ShareUserRow({
  share,
  label,
  workspaceRole,
  online,
  currentUserId,
  granteeIsWorkspaceMember,
  onDelete,
}: {
  share: PageShare;
  label: string;
  workspaceRole: WorkspaceRole;
  online: boolean;
  currentUserId: string | undefined;
  granteeIsWorkspaceMember: boolean;
  onDelete: () => void;
}) {
  const rowAffordance = deriveShareDialogRowAffordance({
    workspaceRole,
    online,
    currentUserId,
    share,
    granteeIsWorkspaceMember,
  });

  return (
    <div className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-zinc-800/50">
      <div className="flex items-center gap-2 overflow-hidden">
        <Users className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span className="truncate text-sm text-zinc-300">{label}</span>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">{share.permission}</span>
      </div>
      {isActionVisible(rowAffordance.revoke) && (
        <button
          onClick={onDelete}
          disabled={!isActionEnabled(rowAffordance.revoke)}
          title={rowAffordance.revoke.kind === "disabled" ? rowAffordance.revoke.reason : undefined}
          className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-red-400 disabled:opacity-50"
          aria-label="Remove share"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function ShareLinkRow({
  share,
  copiedId,
  workspaceRole,
  online,
  currentUserId,
  onCopy,
  onDelete,
}: {
  share: PageShare;
  copiedId: string | null;
  workspaceRole: WorkspaceRole;
  online: boolean;
  currentUserId: string | undefined;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const rowAffordance = deriveShareDialogRowAffordance({
    workspaceRole,
    online,
    currentUserId,
    share,
    granteeIsWorkspaceMember: false,
  });

  return (
    <div className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-zinc-800/50">
      <div className="flex items-center gap-2 overflow-hidden">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span className="truncate text-sm text-zinc-300">{share.permission} link</span>
      </div>
      <div className="flex items-center gap-1">
        {isActionVisible(rowAffordance.copyLink) && (
          <button
            onClick={onCopy}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-300"
            aria-label="Copy link"
          >
            {copiedId === share.id ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        )}
        {isActionVisible(rowAffordance.revoke) && (
          <button
            onClick={onDelete}
            disabled={!isActionEnabled(rowAffordance.revoke)}
            title={rowAffordance.revoke.kind === "disabled" ? rowAffordance.revoke.reason : undefined}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-red-400 disabled:opacity-50"
            aria-label="Remove link"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function ShareDialog({ pageId, disabled = false, title }: ShareDialogProps) {
  const { shell, people, link } = useShareDialogController({ pageId, disabled, title });

  return (
    <ShareDialogShellContext.Provider value={shell}>
      <SharePeopleContext.Provider value={people}>
        <ShareLinkContext.Provider value={link}>
          <div className="relative">
            <ShareDialogTrigger />
            <ShareDialogPanel />
          </div>
        </ShareLinkContext.Provider>
      </SharePeopleContext.Provider>
    </ShareDialogShellContext.Provider>
  );
}
