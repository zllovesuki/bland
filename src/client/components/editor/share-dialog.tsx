import { useState, useRef, useCallback, useEffect } from "react";
import { Share2, Link2, Copy, Check, Trash2, Users, Loader2, ChevronDown } from "lucide-react";
import { useClickOutside } from "@/client/hooks/use-click-outside";
import { api, toApiError } from "@/client/lib/api";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useAuthStore } from "@/client/stores/auth-store";
import { Skeleton } from "@/client/components/ui/skeleton";
import type { PageShare, WorkspaceMember } from "@/shared/types";

interface ShareDialogProps {
  pageId: string;
  workspaceId: string;
}

export function ShareDialog({ pageId, workspaceId }: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<PageShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [newPermission, setNewPermission] = useState<"view" | "edit">("view");
  const [newGranteeId, setNewGranteeId] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const panelRef = useRef<HTMLDivElement>(null);
  useClickOutside(
    panelRef,
    useCallback(() => setOpen(false), []),
    open,
  );

  const members = useWorkspaceStore((s) => s.members);
  const user = useAuthStore((s) => s.user);

  const myRole = members.find((m) => m.user_id === user?.id)?.role;
  const isAdmin = myRole === "owner" || myRole === "admin";

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    api.shares
      .list(pageId)
      .then((s) => setShares(s))
      .catch((err) => setError(toApiError(err).message))
      .finally(() => setLoading(false));
  }, [open, pageId]);

  const linkShares = shares.filter((s) => s.grantee_type === "link");
  const userShares = shares.filter((s) => s.grantee_type === "user");

  const sharedUserIds = new Set(userShares.map((s) => s.grantee_id));
  const shareableMembers = members.filter((m) => m.user_id !== user?.id && !sharedUserIds.has(m.user_id));

  async function createLinkShare() {
    setCreating(true);
    setError(null);
    try {
      const share = await api.shares.create(pageId, {
        grantee_type: "link",
        permission: newPermission,
      });
      setShares((prev) => [...prev, share]);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setCreating(false);
    }
  }

  async function createEmailShare() {
    if (!newEmail.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const share = await api.shares.create(pageId, {
        grantee_type: "user",
        grantee_email: newEmail.trim(),
        permission: newPermission,
      });
      setShares((prev) => [...prev, share]);
      setNewEmail("");
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setCreating(false);
    }
  }

  async function createUserShare() {
    if (!newGranteeId) return;
    setCreating(true);
    setError(null);
    try {
      const share = await api.shares.create(pageId, {
        grantee_type: "user",
        grantee_id: newGranteeId,
        permission: newPermission,
      });
      setShares((prev) => [...prev, share]);
      setNewGranteeId("");
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteShare(shareId: string) {
    try {
      await api.shares.delete(pageId, shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (err) {
      setError(toApiError(err).message);
    }
  }

  function copyLink(share: PageShare) {
    if (!share.link_token) return;
    const url = `${window.location.origin}/s/${share.link_token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(share.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function memberName(member: WorkspaceMember): string {
    return member.user?.name ?? member.user?.email ?? member.user_id;
  }

  function granteeName(share: PageShare): string {
    if (share.grantee_user) {
      return share.grantee_user.name || share.grantee_user.email;
    }
    const member = members.find((m) => m.user_id === share.grantee_id);
    return member ? memberName(member) : (share.grantee_id ?? "Unknown");
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          if (!open) {
            setLoading(true);
            setShares([]);
            setError(null);
          }
          setOpen((o) => !o);
        }}
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
      >
        <Share2 className="h-3.5 w-3.5" />
        Share
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full z-30 mt-1 w-80 rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-lg"
        >
          {loading ? (
            <div className="space-y-2 py-1" aria-busy="true">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

              {linkShares.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1.5 text-xs font-medium text-zinc-400">Link shares</p>
                  <div className="space-y-1">
                    {linkShares.map((share) => (
                      <div
                        key={share.id}
                        className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-zinc-800/50"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <Link2 className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                          <span className="truncate text-xs text-zinc-300">{share.permission} link</span>
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
                            {share.permission}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {share.link_token && (
                            <button
                              onClick={() => copyLink(share)}
                              className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-700 hover:text-zinc-300"
                              title="Copy link"
                            >
                              {copiedId === share.id ? (
                                <Check className="h-3.5 w-3.5 text-green-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => deleteShare(share.id)}
                            className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-700 hover:text-red-400"
                            title="Remove share"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {userShares.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1.5 text-xs font-medium text-zinc-400">People with access</p>
                  <div className="space-y-1">
                    {userShares.map((share) => (
                      <div
                        key={share.id}
                        className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-zinc-800/50"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <Users className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                          <span className="truncate text-xs text-zinc-300">{granteeName(share)}</span>
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
                            {share.permission}
                          </span>
                        </div>
                        <button
                          onClick={() => deleteShare(share.id)}
                          className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-700 hover:text-red-400"
                          title="Remove share"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {linkShares.length === 0 && userShares.length === 0 && (
                <p className="mb-3 text-xs text-zinc-500">No shares yet.</p>
              )}

              <div className="border-t border-zinc-700/50 pt-2">
                <div className="mb-2 flex items-center gap-2">
                  <label className="text-xs text-zinc-400">Permission</label>
                  <div className="relative">
                    <select
                      value={newPermission}
                      onChange={(e) => setNewPermission(e.target.value as "view" | "edit")}
                      className="appearance-none rounded-md border border-zinc-700 bg-zinc-800 py-1 pl-2 pr-6 text-xs text-zinc-300 outline-none focus:border-zinc-600"
                    >
                      <option value="view">View</option>
                      <option value="edit">Edit</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
                  </div>
                </div>

                {isAdmin && (
                  <button
                    onClick={createLinkShare}
                    disabled={creating}
                    className="mb-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                  >
                    {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    Create link share
                  </button>
                )}

                {myRole && myRole !== "guest" && shareableMembers.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <select
                        value={newGranteeId}
                        onChange={(e) => setNewGranteeId(e.target.value)}
                        className="w-full appearance-none rounded-md border border-zinc-700 bg-zinc-800 py-1.5 pl-2 pr-6 text-xs text-zinc-300 outline-none focus:border-zinc-600"
                      >
                        <option value="">Select member...</option>
                        {shareableMembers.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {memberName(m)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
                    </div>
                    <button
                      onClick={createUserShare}
                      disabled={creating || !newGranteeId}
                      className="rounded-md px-2 py-1.5 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                    >
                      {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Share"}
                    </button>
                  </div>
                )}

                {isAdmin && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      type="email"
                      placeholder="Share by email..."
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") createEmailShare();
                      }}
                      className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 py-1.5 pl-2 text-xs text-zinc-300 outline-none focus:border-zinc-600"
                    />
                    <button
                      onClick={createEmailShare}
                      disabled={creating || !newEmail.trim()}
                      className="rounded-md px-2 py-1.5 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                    >
                      {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Share"}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
