import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { confirm } from "@/client/components/confirm";
import {
  ArrowLeft,
  Save,
  Loader2,
  Trash2,
  ChevronDown,
  Settings,
  Shield,
  Crown,
  User as UserIcon,
  UserPlus,
  Copy,
  Check,
  X,
} from "lucide-react";
import { Avatar } from "@/client/components/ui/avatar";
import { Button } from "@/client/components/ui/button";
import { useCurrentWorkspace, useWorkspaceMembers } from "./use-workspace-view";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import { useAuthStore } from "@/client/stores/auth-store";
import { api, toApiError } from "@/client/lib/api";
import { toast } from "@/client/components/toast";
import { useClickOutside } from "@/client/hooks/use-click-outside";
import { useCopyFeedback } from "@/client/hooks/use-copy-feedback";
import { useMyRole } from "@/client/hooks/use-role";
import { EmojiPicker } from "@/client/components/ui/emoji-picker";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import type { WorkspaceMember } from "@/shared/types";

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  owner: { label: "Owner", className: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  admin: { label: "Admin", className: "bg-blue-500/10 text-blue-400 border border-blue-500/20" },
  member: { label: "Member", className: "bg-zinc-500/10 text-zinc-400 border border-zinc-700" },
  guest: { label: "Guest", className: "bg-zinc-500/10 text-zinc-500 border border-zinc-700" },
};

const ROLE_ICON: Record<string, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: UserIcon,
  guest: UserIcon,
};

const ASSIGNABLE_ROLES = ["admin", "member", "guest"] as const;

export function WorkspaceSettings() {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { workspaceSlug?: string };
  // Workspace layout gating guarantees member access here. Read through the
  // snapshot store so a successful save shows the new name/icon immediately;
  // the route/provider state only carries workspace identity.
  const currentWorkspace = useCurrentWorkspace();
  const members = useWorkspaceMembers();
  const replaceMembers = useWorkspaceStore((s) => s.replaceSnapshotMembers);
  const patchWorkspace = useWorkspaceStore((s) => s.patchWorkspace);
  const currentUser = useAuthStore((s) => s.user);
  const { role, isOwner, isAdminOrOwner } = useMyRole();
  const myRole = role ?? "guest";
  useDocumentTitle(currentWorkspace ? `Settings — ${currentWorkspace.name}` : "Settings");

  const [name, setName] = useState(currentWorkspace?.name ?? "");
  const [icon, setIcon] = useState(currentWorkspace?.icon ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const previousWorkspaceRef = useRef<{ id: string; name: string; icon: string } | null>(null);

  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const iconPickerRef = useRef<HTMLDivElement>(null);
  useClickOutside(
    iconPickerRef,
    useCallback(() => setIconPickerOpen(false), []),
    iconPickerOpen,
  );

  const [roleDropdownId, setRoleDropdownId] = useState<string | null>(null);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);

  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "guest">("member");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const { copiedId: inviteCopied, copy: copyInviteToClipboard } = useCopyFeedback<string>();
  const [inviteError, setInviteError] = useState<string | null>(null);

  const roleDropdownRef = useRef<HTMLDivElement>(null);
  useClickOutside(
    roleDropdownRef,
    useCallback(() => setRoleDropdownId(null), []),
    roleDropdownId !== null,
  );

  useEffect(() => {
    if (!currentWorkspace) {
      previousWorkspaceRef.current = null;
      return;
    }

    const nextWorkspace = {
      id: currentWorkspace.id,
      name: currentWorkspace.name,
      icon: currentWorkspace.icon ?? "",
    };
    const previousWorkspace = previousWorkspaceRef.current;
    const isNewWorkspace = previousWorkspace?.id !== currentWorkspace.id;

    if (isNewWorkspace || !previousWorkspace || name === previousWorkspace.name) {
      setName(nextWorkspace.name);
    }

    if (isNewWorkspace || !previousWorkspace || icon === previousWorkspace.icon) {
      setIcon(nextWorkspace.icon);
    }

    previousWorkspaceRef.current = nextWorkspace;
  }, [currentWorkspace?.id, currentWorkspace?.name, currentWorkspace?.icon, name, icon]);

  const handleSave = useCallback(async () => {
    if (!currentWorkspace || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.workspaces.update(currentWorkspace.id, {
        name: name.trim(),
        icon: icon.trim() || null,
      });
      patchWorkspace(currentWorkspace.id, updated);
      useWorkspaceStore.getState().upsertMemberWorkspace(updated);
      setName(updated.name);
      setIcon(updated.icon ?? "");
    } catch (err) {
      setSaveError(toApiError(err).message);
    } finally {
      setSaving(false);
    }
  }, [currentWorkspace, name, icon, saving, patchWorkspace]);

  const handleRoleChange = useCallback(
    async (userId: string, newRole: string) => {
      if (!currentWorkspace) return;
      setRoleDropdownId(null);
      setUpdatingRole(userId);
      setMemberError(null);
      try {
        await api.workspaces.updateMemberRole(currentWorkspace.id, userId, newRole);
        replaceMembers(
          currentWorkspace.id,
          members.map((m) => (m.user_id === userId ? { ...m, role: newRole as WorkspaceMember["role"] } : m)),
        );
      } catch (err) {
        setMemberError(toApiError(err).message);
      } finally {
        setUpdatingRole(null);
      }
    },
    [currentWorkspace, members, replaceMembers],
  );

  const handleRemoveMember = useCallback(
    async (userId: string, memberName: string) => {
      if (!currentWorkspace) return;
      const ok = await confirm({
        title: "Remove member",
        message: `${memberName} will lose access to this workspace.`,
        confirmLabel: "Remove",
        variant: "danger",
      });
      if (!ok) return;
      setRemovingMember(userId);
      setMemberError(null);
      try {
        await api.workspaces.removeMember(currentWorkspace.id, userId);
        replaceMembers(
          currentWorkspace.id,
          members.filter((m) => m.user_id !== userId),
        );
      } catch (err) {
        setMemberError(toApiError(err).message);
      } finally {
        setRemovingMember(null);
      }
    },
    [currentWorkspace, members, replaceMembers],
  );

  const handleCreateInvite = useCallback(async () => {
    if (!currentWorkspace || inviteLoading) return;
    setInviteLoading(true);
    setInviteError(null);
    setInviteLink(null);
    try {
      const invite = await api.invites.create(currentWorkspace.id, {
        role: inviteRole,
        email: inviteEmail.trim() || undefined,
      });
      const link = `${window.location.origin}/invite/${invite.token}`;
      setInviteLink(link);
      setInviteEmail("");
    } catch (err) {
      setInviteError(toApiError(err).message);
    } finally {
      setInviteLoading(false);
    }
  }, [currentWorkspace, inviteRole, inviteEmail, inviteLoading]);

  const copyInviteLink = useCallback(() => {
    if (!inviteLink) return;
    copyInviteToClipboard("invite", inviteLink);
  }, [inviteLink, copyInviteToClipboard]);

  const [deleting, setDeleting] = useState(false);

  const handleDeleteWorkspace = useCallback(async () => {
    if (!currentWorkspace || !isOwner || deleting) return;
    const ok = await confirm({
      title: "Delete workspace",
      message: `"${currentWorkspace.name}" and all its pages will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api.workspaces.delete(currentWorkspace.id);
      const store = useWorkspaceStore.getState();
      store.removeMemberWorkspace(currentWorkspace.id);
      store.removeWorkspaceSnapshot(currentWorkspace.id);
      navigate({ to: "/" });
    } catch {
      toast.error("Failed to delete workspace");
      setDeleting(false);
    }
  }, [currentWorkspace, isOwner, deleting, navigate]);

  if (!currentWorkspace) return null;

  const hasChanges = name.trim() !== currentWorkspace.name || (icon.trim() || null) !== (currentWorkspace.icon ?? null);

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
          <Settings className="h-5 w-5 text-zinc-400" />
        </div>
        <h1 className="text-xl font-semibold text-zinc-100">Workspace Settings</h1>
      </div>

      {isOwner && (
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-zinc-200">Workspace Info</h2>
          <div className="space-y-4 rounded-lg border border-zinc-800 p-4">
            <div>
              <label htmlFor="ws-name" className="mb-1 block text-sm font-medium text-zinc-400">
                Name
              </label>
              <div className="relative flex items-center gap-2" ref={iconPickerRef}>
                <div className="group/wsicon flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={() => setIconPickerOpen((o) => !o)}
                    className="flex h-[38px] w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/50 text-lg transition-colors hover:border-zinc-600"
                    aria-label={icon ? "Change icon" : "Add icon"}
                  >
                    {icon ? <EmojiIcon emoji={icon} size={20} /> : <span className="text-xs text-zinc-500">😀</span>}
                  </button>
                  {icon && (
                    <button
                      onClick={() => {
                        setIcon("");
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-zinc-300 group-hover/wsicon:opacity-100"
                      aria-label="Remove icon"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <input
                  id="ws-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/30"
                  placeholder="Workspace name"
                />
                {iconPickerOpen && (
                  <div className="absolute left-0 top-full z-30 mt-1">
                    <EmojiPicker
                      onSelect={(emoji) => {
                        setIcon(emoji);
                        setIconPickerOpen(false);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
            {saveError && <p className="text-sm text-red-400">{saveError}</p>}
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={saving || !name.trim() || !hasChanges}
                icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              >
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-zinc-200">
          Members <span className="text-sm font-normal text-zinc-400">({members.length})</span>
        </h2>
        {memberError && <p className="mb-3 text-sm text-red-400">{memberError}</p>}
        <div className="space-y-2">
          {members.map((member, memberIndex) => {
            const user = member.user;
            const displayName = user?.name ?? "Unknown";
            const displayEmail = user?.email ?? "";
            const badge = ROLE_BADGE[member.role] ?? ROLE_BADGE.member;
            const RoleIcon = ROLE_ICON[member.role] ?? UserIcon;
            const isSelf = member.user_id === currentUser?.id;
            const isMemberOwner = member.role === "owner";
            const canManage = isAdminOrOwner && !isSelf && !isMemberOwner;

            return (
              <div
                key={member.user_id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-3 opacity-0 animate-slide-up"
                style={{ animationDelay: `${Math.min(memberIndex, 7) * 60}ms` }}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <Avatar
                    name={displayName}
                    avatarUrl={user?.avatar_url}
                    className="h-8 w-8 border border-zinc-700 text-sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-200">
                      {displayName}
                      {isSelf && <span className="ml-1 text-xs text-zinc-500">(you)</span>}
                    </p>
                    {displayEmail && <p className="truncate text-xs text-zinc-400">{displayEmail}</p>}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {canManage ? (
                    <div className="relative" ref={roleDropdownId === member.user_id ? roleDropdownRef : undefined}>
                      <button
                        onClick={() => setRoleDropdownId(roleDropdownId === member.user_id ? null : member.user_id)}
                        disabled={updatingRole === member.user_id}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className} transition-opacity hover:opacity-80`}
                      >
                        {updatingRole === member.user_id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            {badge.label}
                            <ChevronDown className="h-3 w-3" />
                          </>
                        )}
                      </button>
                      {roleDropdownId === member.user_id && (
                        <div className="animate-scale-fade origin-top-right absolute right-0 top-full z-10 mt-1 w-32 rounded-lg border border-zinc-700 bg-zinc-800 py-1 shadow-lg">
                          {ASSIGNABLE_ROLES.map((role) => (
                            <button
                              key={role}
                              onClick={() => handleRoleChange(member.user_id, role)}
                              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-zinc-700/50 ${
                                member.role === role ? "text-accent-400" : "text-zinc-400 hover:text-zinc-200"
                              }`}
                            >
                              {role.charAt(0).toUpperCase() + role.slice(1)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      <RoleIcon className="h-3 w-3" />
                      {badge.label}
                    </span>
                  )}

                  {canManage && (
                    <button
                      onClick={() => handleRemoveMember(member.user_id, displayName)}
                      disabled={removingMember === member.user_id}
                      className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400 disabled:opacity-50"
                      aria-label={`Remove ${displayName}`}
                    >
                      {removingMember === member.user_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {myRole !== "guest" && (
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-zinc-200">
            <UserPlus className="mr-2 inline h-5 w-5" />
            Invite
          </h2>
          <div className="space-y-3 rounded-lg border border-zinc-800 p-4">
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email (optional)"
                aria-label="Invite email address"
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/30"
              />
              <div className="relative">
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "admin" | "member" | "guest")}
                  className="appearance-none rounded-lg border border-zinc-700 bg-zinc-800/50 py-2 pl-3 pr-8 text-sm text-zinc-300 outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/30"
                >
                  {isAdminOrOwner && (
                    <option value="admin" className="bg-zinc-800 text-zinc-300">
                      Admin
                    </option>
                  )}
                  <option value="member" className="bg-zinc-800 text-zinc-300">
                    Member
                  </option>
                  <option value="guest" className="bg-zinc-800 text-zinc-300">
                    Guest
                  </option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateInvite}
                disabled={inviteLoading}
                icon={inviteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              >
                Create invite
              </Button>
            </div>
            {inviteError && <p className="text-sm text-red-400">{inviteError}</p>}
            {inviteLink && (
              <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2">
                <p className="min-w-0 flex-1 truncate text-xs text-zinc-400">{inviteLink}</p>
                <button
                  onClick={copyInviteLink}
                  className="shrink-0 rounded p-1 text-zinc-400 transition-colors hover:text-zinc-200"
                  aria-label="Copy invite link"
                >
                  {inviteCopied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {isOwner && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-red-400">Danger Zone</h2>
          <div className="rounded-lg border border-red-500/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-200">Delete this workspace</p>
                <p className="text-xs text-zinc-400">All pages and data will be permanently removed.</p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDeleteWorkspace}
                disabled={deleting}
                icon={deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              >
                Delete workspace
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
