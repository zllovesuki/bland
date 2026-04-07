import { useState, useRef, useCallback } from "react";
import { Image, X, Upload } from "lucide-react";
import { uploadFile } from "@/client/lib/uploads";
import { UPLOAD_MIME_SET } from "@/shared/types";
import { toast } from "@/client/components/toast";
import { Dialog } from "@/client/components/ui/dialog";

const GRADIENT_PRESETS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
  "linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)",
  "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)",
  "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
  "linear-gradient(135deg, #667eea 0%, #43e97b 100%)",
  "linear-gradient(135deg, #0c3483 0%, #a2b6df 100%)",
  "linear-gradient(135deg, #ff0844 0%, #ffb199 100%)",
];

export function CoverPicker({
  currentCover,
  onSelect,
  workspaceId,
  pageId,
}: {
  currentCover: string | null;
  onSelect: (cover: string | null) => void;
  workspaceId: string;
  pageId: string;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!UPLOAD_MIME_SET.has(file.type) || !file.type.startsWith("image/")) return;

      setUploading(true);
      try {
        const url = await uploadFile(workspaceId, file, pageId);
        onSelect(url);
        setOpen(false);
      } catch {
        toast.error("Failed to upload cover");
      } finally {
        setUploading(false);
      }
    },
    [workspaceId, pageId, onSelect],
  );

  return (
    <>
      {currentCover ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-md bg-zinc-900/80 px-2 py-1 text-sm text-zinc-300 opacity-0 transition-opacity hover:bg-zinc-900 group-hover/cover:opacity-100"
        >
          Change cover
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-zinc-300 group-hover/actions:opacity-100"
        >
          <Image className="h-4 w-4" />
          <span>Add cover</span>
        </button>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} className="w-full max-w-sm p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-medium text-zinc-300">Cover</span>
          <div className="flex items-center gap-2">
            {currentCover && (
              <button
                onClick={() => {
                  onSelect(null);
                  setOpen(false);
                }}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              >
                <X className="h-3 w-3" />
                Remove
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mb-4">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">Gradients</span>
          <div className="grid grid-cols-4 gap-2">
            {GRADIENT_PRESETS.map((gradient) => (
              <button
                key={gradient}
                onClick={() => {
                  onSelect(gradient);
                  setOpen(false);
                }}
                className={`h-12 rounded-md hover:ring-2 hover:ring-accent-500 ${
                  currentCover === gradient ? "ring-2 ring-accent-500" : ""
                }`}
                style={{ background: gradient }}
              />
            ))}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">Upload image</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-zinc-700 py-4 text-sm text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-300 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading..." : "Choose image"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />
        </div>
      </Dialog>
    </>
  );
}
