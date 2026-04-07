import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Share2, Link2, Copy, Check, Trash2, Users, Loader2, ChevronDown } from "lucide-react";
import { useClickOutside } from "@/client/hooks/use-click-outside";
import { useCopyFeedback } from "@/client/hooks/use-copy-feedback";
import { api, toApiError } from "@/client/lib/api";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useAuthStore } from "@/client/stores/auth-store";
import { useMyRole } from "@/client/hooks/use-role";
import { confirm } from "@/client/components/confirm";
import { Skeleton } from "@/client/components/ui/skeleton";
import type { PageShare, WorkspaceMember } from "@/shared/types";

function PermissionSelect({ value, onChange }: { value: "view" | "edit"; onChange: (v: "view" | "edit") => void }) {
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as "view" | "edit")}
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
}

export function ShareDialog({ pageId }: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<PageShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { copiedId, copy: copyToClipboard } = useCopyFeedback<string>();
  const [creating, setCreating] = useState(false);

  // People section
  const [peopleInput, setPeopleInput] = useState("");
  const [peoplePermission, setPeoplePermission] = useState<"view" | "edit">("view");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Link section
  const [linkPermission, setLinkPermission] = useState<"view" | "edit">("view");

  const panelRef = useRef<HTMLDivElement>(null);
  useClickOutside(
    panelRef,
    useCallback(() => setOpen(false), []),
    open,
  );

  const members = useWorkspaceStore((s) => s.members);
  const user = useAuthStore((s) => s.user);

  const { role: myRole, isAdminOrOwner: isAdmin } = useMyRole();

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

  const { linkShares, userShares, shareableMembers } = useMemo(() => {
    const link = shares.filter((s) => s.grantee_type === "link");
    const userS = shares.filter((s) => s.grantee_type === "user");
    const sharedIds = new Set(userS.map((s) => s.grantee_id));
    const shareable = members.filter((m) => m.user_id !== user?.id && !sharedIds.has(m.user_id));
    return { linkShares: link, userShares: userS, shareableMembers: shareable };
  }, [shares, members, user?.id]);

  const filteredSuggestions = useMemo(() => {
    if (!peopleInput.trim()) return shareableMembers;
    const q = peopleInput.toLowerCase();
    return shareableMembers.filter(
      (m) => (m.user?.name?.toLowerCase().includes(q) ?? false) || (m.user?.email?.toLowerCase().includes(q) ?? false),
    );
  }, [peopleInput, shareableMembers]);

  async function handlePeopleShare() {
    if (!peopleInput.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      // Check if input matches a member
      const matchedMember = shareableMembers.find(
        (m) => m.user?.email?.toLowerCase() === peopleInput.trim().toLowerCase() || m.user?.name === peopleInput.trim(),
      );
      let share: PageShare;
      if (matchedMember) {
        share = await api.shares.create(pageId, {
          grantee_type: "user",
          grantee_id: matchedMember.user_id,
          permission: peoplePermission,
        });
      } else {
        // Treat as email
        share = await api.shares.create(pageId, {
          grantee_type: "user",
          grantee_email: peopleInput.trim(),
          permission: peoplePermission,
        });
      }
      setShares((prev) => [...prev, share]);
      setPeopleInput("");
      setShowSuggestions(false);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setCreating(false);
    }
  }

  function selectMember(member: WorkspaceMember) {
    setPeopleInput(member.user?.email ?? member.user?.name ?? member.user_id);
    setShowSuggestions(false);
  }

  async function createLinkShare() {
    setCreating(true);
    setError(null);
    try {
      const share = await api.shares.create(pageId, {
        grantee_type: "link",
        permission: linkPermission,
      });
      setShares((prev) => [...prev, share]);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteShare(shareId: string) {
    const ok = await confirm({
      title: "Remove share",
      message: "This person or link will lose access to the page.",
    });
    if (!ok) return;
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
    copyToClipboard(share.id, url);
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
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
      >
        <Share2 className="h-3.5 w-3.5" />
        Share
      </button>

      {open && (
        <div
          ref={panelRef}
          className="animate-scale-fade origin-top-right absolute right-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-lg"
        >
          {loading ? (
            <div className="space-y-2 py-1" aria-busy="true">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              {error && <p className="mb-2 text-sm text-red-400">{error}</p>}

              {/* People section */}
              {myRole && myRole !== "guest" && (
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
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handlePeopleShare();
                      }}
                      className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 py-1.5 pl-2 text-sm text-zinc-300 outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/30"
                    />
                    <PermissionSelect value={peoplePermission} onChange={setPeoplePermission} />
                    <button
                      onClick={handlePeopleShare}
                      disabled={creating || !peopleInput.trim()}
                      className="shrink-0 rounded-md px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                    >
                      {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Share"}
                    </button>
                    {showSuggestions && filteredSuggestions.length > 0 && peopleInput.trim() && (
                      <div className="animate-scale-fade origin-top-left absolute left-0 top-full z-10 mt-1 max-h-32 w-full overflow-y-auto rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-lg">
                        {filteredSuggestions.map((m) => (
                          <button
                            key={m.user_id}
                            onClick={() => selectMember(m)}
                            className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
                          >
                            <span className="truncate">{memberName(m)}</span>
                            {m.user?.email && m.user.name && (
                              <span className="truncate text-zinc-500">{m.user.email}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {userShares.length > 0 ? (
                    <div className="space-y-1">
                      {userShares.map((share) => (
                        <div
                          key={share.id}
                          className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-zinc-800/50"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <Users className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                            <span className="truncate text-sm text-zinc-300">{granteeName(share)}</span>
                            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">
                              {share.permission}
                            </span>
                          </div>
                          {(isAdmin || share.created_by === user?.id) && (
                            <button
                              onClick={() => deleteShare(share.id)}
                              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-red-400"
                              aria-label="Remove share"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="px-2 text-sm text-zinc-600">No people shares</p>
                  )}
                </div>
              )}

              {/* Link section */}
              {(isAdmin || linkShares.length > 0) && (
                <div className={myRole && myRole !== "guest" ? "border-t border-zinc-700/50 pt-3" : ""}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-400">
                    <Link2 className="h-3 w-3" />
                    Link
                  </p>
                  {isAdmin && (
                    <div className="mb-2 flex items-center gap-1.5">
                      <button
                        onClick={createLinkShare}
                        disabled={creating}
                        className="flex flex-1 items-center gap-2 rounded-md border border-dashed border-zinc-700 px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-50"
                      >
                        {creating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Link2 className="h-3.5 w-3.5" />
                        )}
                        Create link
                      </button>
                      <PermissionSelect value={linkPermission} onChange={setLinkPermission} />
                    </div>
                  )}
                  {linkShares.length > 0 ? (
                    <div className="space-y-1">
                      {linkShares.map((share) => (
                        <div
                          key={share.id}
                          className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-zinc-800/50"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <Link2 className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                            <span className="truncate text-sm text-zinc-300">{share.permission} link</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {share.link_token && (
                              <button
                                onClick={() => copyLink(share)}
                                className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-300"
                                aria-label="Copy link"
                              >
                                {copiedId === share.id ? (
                                  <Check className="h-3.5 w-3.5 text-green-400" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => deleteShare(share.id)}
                                className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-red-400"
                                aria-label="Remove link"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    isAdmin && <p className="px-2 text-sm text-zinc-600">No link shares</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
