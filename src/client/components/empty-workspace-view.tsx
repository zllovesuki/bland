import { useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Loader2 } from "lucide-react";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { api } from "@/client/lib/api";
import { slugify } from "@/lib/slugify";

export function EmptyWorkspaceView() {
  const navigate = useNavigate();
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !slug.trim() || creating) return;
    setCreating(true);
    try {
      const ws = await api.workspaces.create({ name: name.trim(), slug: slug.trim() });
      addWorkspace(ws);
      navigate({ to: "/$workspaceSlug", params: { workspaceSlug: ws.slug } });
    } catch {
      // Silently fail
    } finally {
      setCreating(false);
    }
  }, [name, slug, creating, addWorkspace, navigate]);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-zinc-200">No workspaces found</h2>
        <p className="mt-1 text-sm text-zinc-500">Create a workspace or accept an invite to get started.</p>

        {showForm ? (
          <div className="mx-auto mt-4 flex w-64 flex-col gap-2">
            <input
              autoFocus
              placeholder="Workspace name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(slugify(e.target.value));
              }}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-teal-500"
            />
            <input
              placeholder="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 outline-none focus:border-teal-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowForm(false);
                  setName("");
                  setSlug("");
                }}
                className="rounded-md px-3 py-1.5 text-sm text-zinc-400 transition hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || !slug.trim() || creating}
                className="flex items-center gap-1.5 rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-teal-500 disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Create
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-500"
          >
            <Plus className="h-4 w-4" />
            Create workspace
          </button>
        )}
      </div>
    </div>
  );
}
