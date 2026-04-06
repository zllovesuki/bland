import { useCallback, useRef, useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Plus,
  Search,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  ChevronDown,
  Pencil,
  Check,
  X,
  Trash2,
} from "lucide-react";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useAuthStore } from "@/client/stores/auth-store";
import { useClickOutside } from "@/client/hooks/use-click-outside";
import { api } from "@/client/lib/api";
import { slugify } from "@/lib/slugify";
import { PageTree } from "./page-tree";

export function Sidebar() {
  const navigate = useNavigate();
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const addPage = useWorkspaceStore((s) => s.addPage);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrentWorkspace);
  const members = useWorkspaceStore((s) => s.members);
  const currentUser = useAuthStore((s) => s.user);
  const isOwner = !!(currentUser && currentWorkspace && currentWorkspace.owner_id === currentUser.id);
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [manualToggle, setManualToggle] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (manualToggle) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [manualToggle]);

  // Workspace switcher state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [creatingWs, setCreatingWs] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(
    dropdownRef,
    useCallback(() => {
      setDropdownOpen(false);
      setShowCreateForm(false);
      setRenaming(false);
    }, []),
    dropdownOpen,
  );

  const handleNewPage = useCallback(async () => {
    if (!currentWorkspace || isCreating) return;
    setIsCreating(true);
    try {
      const page = await api.pages.create(currentWorkspace.id, {
        title: "Untitled",
      });
      addPage(page);
      navigate({
        to: "/$workspaceSlug/$pageId",
        params: { workspaceSlug: currentWorkspace.slug, pageId: page.id },
      });
    } catch {
      // Silently fail - could add toast later
    } finally {
      setIsCreating(false);
    }
  }, [currentWorkspace, isCreating, addPage, navigate]);

  const handleCreateWorkspace = useCallback(async () => {
    if (!createName.trim() || !createSlug.trim() || creatingWs) return;
    setCreatingWs(true);
    try {
      const ws = await api.workspaces.create({ name: createName.trim(), slug: createSlug.trim() });
      addWorkspace(ws);
      setDropdownOpen(false);
      setShowCreateForm(false);
      setCreateName("");
      setCreateSlug("");
      navigate({ to: "/$workspaceSlug", params: { workspaceSlug: ws.slug } });
    } catch {
      // Silently fail
    } finally {
      setCreatingWs(false);
    }
  }, [createName, createSlug, creatingWs, addWorkspace, navigate]);

  const handleRename = useCallback(async () => {
    if (!currentWorkspace || !renameName.trim()) return;
    try {
      const updated = await api.workspaces.update(currentWorkspace.id, { name: renameName.trim() });
      setCurrentWorkspace(updated);
      // Update in workspaces list too
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
    <aside
      className={`relative flex shrink-0 flex-col border-r border-zinc-800/50 bg-zinc-950/50 transition-[width] duration-200 ${
        collapsed ? "w-12" : "w-[260px]"
      }`}
    >
      {collapsed ? (
        <div className="flex flex-1 flex-col items-center gap-2 pt-2">
          <button
            onClick={handleNewPage}
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="New page"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => {
              setManualToggle(true);
              setCollapsed(false);
            }}
            className="mb-3 flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Expand sidebar"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
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
                            className="flex-1 rounded border border-zinc-600 bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200 outline-none focus:border-teal-500"
                          />
                          <button type="submit" className="text-zinc-400 hover:text-teal-400">
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
                        className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-teal-500"
                      />
                      <input
                        placeholder="slug"
                        value={createSlug}
                        onChange={(e) => setCreateSlug(e.target.value)}
                        className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 outline-none focus:border-teal-500"
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
                          onClick={handleCreateWorkspace}
                          disabled={!createName.trim() || !createSlug.trim() || creatingWs}
                          className="rounded bg-teal-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-teal-500 disabled:opacity-50"
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

          <div className="flex items-center gap-1 px-2 py-2">
            <button
              onClick={handleNewPage}
              disabled={isCreating}
              className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800/50 hover:text-zinc-200 disabled:opacity-50"
            >
              {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              New page
            </button>
            <button
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-zinc-500 transition hover:bg-zinc-800/50 hover:text-zinc-300"
              aria-label="Search pages"
            >
              <Search className="h-3.5 w-3.5" />
              <kbd className="hidden rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-zinc-500 sm:inline">
                {"\u2318"}K
              </kbd>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-1">
            <PageTree />
          </nav>

          <div className="border-t border-zinc-800/50 px-2 py-2">
            <button
              onClick={() => {
                setManualToggle(true);
                setCollapsed(true);
              }}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-500 transition hover:bg-zinc-800/50 hover:text-zinc-300"
              aria-label="Collapse sidebar"
            >
              <ChevronsLeft className="h-4 w-4" />
              <span>Collapse</span>
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
