import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useParams } from "@tanstack/react-router";
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
} from "lucide-react";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useAuthStore } from "@/client/stores/auth-store";
import { api, toApiError } from "@/client/lib/api";
import { useClickOutside } from "@/client/hooks/use-click-outside";
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
  const params = useParams({ strict: false }) as { workspaceSlug?: string };
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const members = useWorkspaceStore((s) => s.members);
  const setMembers = useWorkspaceStore((s) => s.setMembers);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrentWorkspace);
  const currentUser = useAuthStore((s) => s.user);

  const myMembership = members.find((m) => m.user_id === currentUser?.id);
  const myRole = myMembership?.role ?? "guest";
  const isOwner = myRole === "owner";
  const isAdminOrOwner = myRole === "owner" || myRole === "admin";

  const [name, setName] = useState(currentWorkspace?.name ?? "");
  const [icon, setIcon] = useState(currentWorkspace?.icon ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [roleDropdownId, setRoleDropdownId] = useState<string | null>(null);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);

  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "guest">("member");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const roleDropdownRef = useRef<HTMLDivElement>(null);
  useClickOutside(
    roleDropdownRef,
    useCallback(() => setRoleDropdownId(null), []),
    roleDropdownId !== null,
  );

  useEffect(() => {
    if (currentWorkspace) {
      setName(currentWorkspace.name);
      setIcon(currentWorkspace.icon ?? "");
    }
  }, [currentWorkspace]);

  const handleSave = useCallback(async () => {
    if (!currentWorkspace || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.workspaces.update(currentWorkspace.id, {
        name: name.trim(),
        icon: icon.trim() || null,
      });
      setCurrentWorkspace(updated);
      const workspaces = useWorkspaceStore.getState().workspaces;
      useWorkspaceStore.getState().setWorkspaces(workspaces.map((w) => (w.id === updated.id ? updated : w)));
    } catch (err) {
      setSaveError(toApiError(err).message);
    } finally {
      setSaving(false);
    }
  }, [currentWorkspace, name, icon, saving, setCurrentWorkspace]);

  const handleRoleChange = useCallback(
    async (userId: string, newRole: string) => {
      if (!currentWorkspace) return;
      setRoleDropdownId(null);
      setUpdatingRole(userId);
      setMemberError(null);
      try {
        await api.workspaces.updateMemberRole(currentWorkspace.id, userId, newRole);
        setMembers(members.map((m) => (m.user_id === userId ? { ...m, role: newRole as WorkspaceMember["role"] } : m)));
      } catch (err) {
        setMemberError(toApiError(err).message);
      } finally {
        setUpdatingRole(null);
      }
    },
    [currentWorkspace, members, setMembers],
  );

  const handleRemoveMember = useCallback(
    async (userId: string, memberName: string) => {
      if (!currentWorkspace) return;
      if (!window.confirm(`Remove ${memberName} from this workspace?`)) return;
      setRemovingMember(userId);
      setMemberError(null);
      try {
        await api.workspaces.removeMember(currentWorkspace.id, userId);
        setMembers(members.filter((m) => m.user_id !== userId));
      } catch (err) {
        setMemberError(toApiError(err).message);
      } finally {
        setRemovingMember(null);
      }
    },
    [currentWorkspace, members, setMembers],
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
    navigator.clipboard.writeText(inviteLink);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }, [inviteLink]);

  if (!currentWorkspace) return null;

  const hasChanges = name.trim() !== currentWorkspace.name || (icon.trim() || null) !== (currentWorkspace.icon ?? null);

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link
        to="/$workspaceSlug"
        params={{ workspaceSlug: params.workspaceSlug ?? "" }}
        className="mb-6 flex items-center gap-2 text-sm text-zinc-400 transition hover:text-zinc-200"
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
              <input
                id="ws-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-accent-500"
                placeholder="Workspace name"
              />
            </div>
            <div>
              <label htmlFor="ws-icon" className="mb-1 block text-sm font-medium text-zinc-400">
                Icon
              </label>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/50 text-lg">
                  {icon || <span className="text-xs text-zinc-500">None</span>}
                </span>
                <input
                  id="ws-icon"
                  type="text"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-accent-500"
                  placeholder="Emoji or short text"
                  maxLength={50}
                />
              </div>
            </div>
            {saveError && <p className="text-sm text-red-400">{saveError}</p>}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving || !name.trim() || !hasChanges}
                className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-zinc-200">
          Members <span className="text-sm font-normal text-zinc-500">({members.length})</span>
        </h2>
        {memberError && <p className="mb-3 text-sm text-red-400">{memberError}</p>}
        <div className="space-y-2">
          {members.map((member) => {
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
                className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-3"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-sm font-medium text-zinc-300">
                    {user?.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={displayName}
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      displayName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-200">
                      {displayName}
                      {isSelf && <span className="ml-1 text-xs text-zinc-500">(you)</span>}
                    </p>
                    {displayEmail && <p className="truncate text-xs text-zinc-500">{displayEmail}</p>}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {canManage ? (
                    <div className="relative" ref={roleDropdownId === member.user_id ? roleDropdownRef : undefined}>
                      <button
                        onClick={() => setRoleDropdownId(roleDropdownId === member.user_id ? null : member.user_id)}
                        disabled={updatingRole === member.user_id}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className} transition hover:opacity-80`}
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
                        <div className="animate-fade-in absolute right-0 top-full z-10 mt-1 w-32 rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl">
                          {ASSIGNABLE_ROLES.map((role) => (
                            <button
                              key={role}
                              onClick={() => handleRoleChange(member.user_id, role)}
                              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-zinc-800 ${
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
                      className="rounded-md p-1 text-zinc-600 transition hover:bg-zinc-800 hover:text-red-400 disabled:opacity-50"
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
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-accent-500"
              />
              <div className="relative">
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "admin" | "member" | "guest")}
                  className="appearance-none rounded-lg border border-zinc-700 bg-zinc-800/50 py-2 pl-3 pr-8 text-sm text-zinc-300 outline-none focus:border-accent-500"
                >
                  {isAdminOrOwner && <option value="admin">Admin</option>}
                  <option value="member">Member</option>
                  <option value="guest">Guest</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreateInvite}
                disabled={inviteLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500 disabled:opacity-50"
              >
                {inviteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Create invite
              </button>
            </div>
            {inviteError && <p className="text-sm text-red-400">{inviteError}</p>}
            {inviteLink && (
              <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2">
                <p className="min-w-0 flex-1 truncate text-xs text-zinc-400">{inviteLink}</p>
                <button
                  onClick={copyInviteLink}
                  className="shrink-0 rounded p-1 text-zinc-400 transition hover:text-zinc-200"
                  title="Copy link"
                >
                  {inviteCopied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
