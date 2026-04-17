import { useCallback, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Loader2, ChevronDown, Pencil, Check, X } from "lucide-react";
import { useCurrentWorkspace } from "@/client/components/workspace/use-workspace-view";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useClickOutside } from "@/client/hooks/use-click-outside";
import { useCreateWorkspace } from "@/client/hooks/use-create-workspace";
import { useMyRole } from "@/client/hooks/use-role";
import { api } from "@/client/lib/api";
import { slugify } from "@/lib/slugify";
import { toast } from "@/client/components/toast";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";

export function WorkspaceSwitcher() {
  const navigate = useNavigate();
  const currentWorkspace = useCurrentWorkspace();
  const workspaces = useWorkspaceStore((s) => s.memberWorkspaces);
  const patchWorkspace = useWorkspaceStore((s) => s.patchWorkspace);
  const { isOwner } = useMyRole();
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
      patchWorkspace(currentWorkspace.id, updated);
      useWorkspaceStore.getState().upsertMemberWorkspace(updated);
    } catch {
      toast.error("Failed to rename workspace");
    }
    setRenaming(false);
  }, [currentWorkspace, renameName, patchWorkspace]);

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex h-10 items-center border-b border-zinc-800/60 px-1.5">
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          aria-expanded={dropdownOpen}
          className={`group flex h-8 min-w-0 flex-1 items-center justify-between rounded-md border px-3 pr-3 transition-[background-color,border-color,color] ${
            dropdownOpen
              ? "border-zinc-700/80 bg-zinc-800/90 text-zinc-100"
              : "border-transparent text-zinc-300 hover:border-zinc-800/80 hover:bg-zinc-800/80 hover:text-zinc-100"
          }`}
        >
          <span className="truncate text-sm font-medium">
            {currentWorkspace?.icon && (
              <span className="mr-1.5 inline-flex items-center align-middle">
                <EmojiIcon emoji={currentWorkspace.icon} size={14} />
              </span>
            )}
            {currentWorkspace?.name ?? "Workspace"}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${
              dropdownOpen ? "rotate-180 text-zinc-300" : "text-zinc-500 group-hover:text-zinc-300"
            }`}
          />
        </button>
      </div>

      {dropdownOpen && (
        <div className="animate-scale-fade origin-top-left absolute left-0 right-0 top-10 z-20 overflow-hidden rounded-xl border border-zinc-700/80 bg-[color:oklch(0.29_0.008_18)] shadow-[0_20px_45px_rgba(0,0,0,0.38)]">
          <div className="max-h-48 overflow-y-auto p-1">
            {workspaces.map((ws) => (
              <div key={ws.id} className="group relative">
                {renaming && ws.id === currentWorkspace?.id ? (
                  <form
                    className="flex items-center gap-1 px-2 py-1"
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
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-[background-color,color,box-shadow] ${
                        ws.id === currentWorkspace?.id
                          ? "bg-[color:oklch(0.355_0.012_18)] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                          : "text-zinc-400 hover:bg-[color:oklch(0.34_0.01_18)] hover:text-zinc-100"
                      }`}
                    >
                      {ws.icon && <EmojiIcon emoji={ws.icon} size={14} />}
                      <span className="truncate">{ws.name}</span>
                    </button>
                    {ws.id === currentWorkspace?.id && isOwner && (
                      <button
                        onClick={() => {
                          setRenaming(true);
                          setRenameName(ws.name);
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 opacity-0 transition-opacity hover:text-zinc-200 group-hover:opacity-100"
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

          <div className="border-t border-zinc-700/80 bg-[color:oklch(0.275_0.007_18)] p-1">
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
                    className="rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
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
                    className="rounded bg-accent-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-500 disabled:opacity-50"
                  >
                    {creatingWs ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-400 transition-[background-color,color] hover:bg-[color:oklch(0.34_0.01_18)] hover:text-zinc-100"
              >
                <Plus className="h-3.5 w-3.5" />
                Create workspace
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
