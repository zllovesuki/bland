import { useCallback, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Loader2, ChevronDown, Pencil, Check, X, Trash2 } from "lucide-react";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useAuthStore } from "@/client/stores/auth-store";
import { useClickOutside } from "@/client/hooks/use-click-outside";
import { useCreateWorkspace } from "@/client/hooks/use-create-workspace";
import { getMyRole } from "@/client/lib/permissions";
import { api } from "@/client/lib/api";
import { slugify } from "@/lib/slugify";

export function WorkspaceSwitcher() {
  const navigate = useNavigate();
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrentWorkspace);
  const members = useWorkspaceStore((s) => s.members);
  const currentUser = useAuthStore((s) => s.user);
  const isOwner = getMyRole(members, currentUser) === "owner";

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { createWorkspace, isCreating: creatingWs } = useCreateWorkspace();

  useClickOutside(
    dropdownRef,
    useCallback(() => {
      setDropdownOpen(false);
      setShowCreateForm(false);
      setRenaming(false);
    }, []),
    dropdownOpen,
  );

  const handleRename = useCallback(async () => {
    if (!currentWorkspace || !renameName.trim()) return;
    try {
      const updated = await api.workspaces.update(currentWorkspace.id, { name: renameName.trim() });
      setCurrentWorkspace(updated);
      useWorkspaceStore.getState().setWorkspaces(workspaces.map((w) => (w.id === updated.id ? updated : w)));
    } catch {
      // Silently fail
    }
    setRenaming(false);
  }, [currentWorkspace, renameName, workspaces, setCurrentWorkspace]);

  const handleDeleteWorkspace = useCallback(async () => {
    if (!currentWorkspace || !isOwner) return;
    if (!window.confirm(`Delete "${currentWorkspace.name}"? This cannot be undone.`)) return;
    try {
      await api.workspaces.delete(currentWorkspace.id);
      const remaining = workspaces.filter((w) => w.id !== currentWorkspace.id);
      useWorkspaceStore.getState().setWorkspaces(remaining);
      setDropdownOpen(false);
      navigate({ to: "/" });
    } catch {
      // Silently fail
    }
  }, [currentWorkspace, isOwner, workspaces, navigate]);

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex h-10 items-center border-b border-zinc-800/50">
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          className="flex h-full min-w-0 flex-1 items-center justify-between px-3 pr-3 transition hover:bg-zinc-800/50"
        >
          <span className="truncate text-sm font-medium text-zinc-300">
            {currentWorkspace?.icon && <span className="mr-1.5">{currentWorkspace.icon}</span>}
            {currentWorkspace?.name ?? "Workspace"}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition ${dropdownOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {dropdownOpen && (
        <div className="absolute left-0 right-0 top-10 z-20 rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg">
          <div className="max-h-48 overflow-y-auto p-1">
            {workspaces.map((ws) => (
              <div key={ws.id} className="group flex items-center">
                {renaming && ws.id === currentWorkspace?.id ? (
                  <form
                    className="flex flex-1 items-center gap-1 px-2 py-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleRename();
                    }}
                  >
                    <input
                      autoFocus
                      value={renameName}
                      onChange={(e) => setRenameName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setRenaming(false);
                      }}
                      className="flex-1 rounded border border-zinc-600 bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200 outline-none focus:border-accent-500"
                    />
                    <button type="submit" className="text-zinc-400 hover:text-accent-400">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenaming(false)}
                      className="text-zinc-400 hover:text-zinc-200"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        navigate({ to: "/$workspaceSlug", params: { workspaceSlug: ws.slug } });
                      }}
                      className={`flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs transition ${
                        ws.id === currentWorkspace?.id
                          ? "bg-zinc-800 text-zinc-100"
                          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                      }`}
                    >
                      {ws.icon && <span>{ws.icon}</span>}
                      <span className="truncate">{ws.name}</span>
                    </button>
                    {ws.id === currentWorkspace?.id && isOwner && (
                      <button
                        onClick={() => {
                          setRenaming(true);
                          setRenameName(ws.name);
                        }}
                        className="mr-1 rounded p-1 text-zinc-500 opacity-0 transition hover:text-zinc-200 group-hover:opacity-100"
                        aria-label="Rename workspace"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-zinc-700 p-1">
            {showCreateForm ? (
              <div className="flex flex-col gap-1.5 p-2">
                <input
                  autoFocus
                  placeholder="Workspace name"
                  value={createName}
                  onChange={(e) => {
                    setCreateName(e.target.value);
                    setCreateSlug(slugify(e.target.value));
                  }}
                  className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-accent-500"
                />
                <input
                  placeholder="slug"
                  value={createSlug}
                  onChange={(e) => setCreateSlug(e.target.value)}
                  className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 outline-none focus:border-accent-500"
                />
                <div className="flex justify-end gap-1">
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setCreateName("");
                      setCreateSlug("");
                    }}
                    className="rounded px-2 py-1 text-xs text-zinc-400 transition hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() =>
                      createWorkspace(createName, createSlug, () => {
                        setDropdownOpen(false);
                        setShowCreateForm(false);
                        setCreateName("");
                        setCreateSlug("");
                      })
                    }
                    disabled={!createName.trim() || !createSlug.trim() || creatingWs}
                    className="rounded bg-accent-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-accent-500 disabled:opacity-50"
                  >
                    {creatingWs ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-400 transition hover:bg-zinc-800/50 hover:text-zinc-200"
              >
                <Plus className="h-3.5 w-3.5" />
                Create workspace
              </button>
            )}
          </div>
          {isOwner && (
            <div className="border-t border-zinc-700 p-1">
              <button
                onClick={handleDeleteWorkspace}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-red-400 transition hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete workspace
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
