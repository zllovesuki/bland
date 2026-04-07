import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { slugify } from "@/lib/slugify";
import { useCreateWorkspace } from "@/client/hooks/use-create-workspace";
import { useDocumentTitle } from "@/client/hooks/use-document-title";

export function EmptyWorkspaceView() {
  useDocumentTitle(undefined);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const { createWorkspace, isCreating } = useCreateWorkspace();

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
              aria-label="Workspace name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(slugify(e.target.value));
              }}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/30"
            />
            <input
              placeholder="slug"
              aria-label="Workspace URL slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/30"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setName("");
                  setSlug("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => createWorkspace(name, slug)}
                disabled={!name.trim() || !slug.trim() || isCreating}
                icon={isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              >
                Create
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="primary"
            size="sm"
            className="mt-4"
            onClick={() => setShowForm(true)}
            icon={<Plus className="h-4 w-4" />}
          >
            Create workspace
          </Button>
        )}
      </div>
    </div>
  );
}
