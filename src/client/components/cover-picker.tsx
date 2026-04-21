import { useState, useRef, useCallback } from "react";
import { Image, X, Upload } from "lucide-react";
import { uploadFile } from "@/client/lib/uploads";
import { toast } from "@/client/components/toast";
import { Dialog } from "@/client/components/ui/dialog";
import { UPLOAD_MIME_SET } from "@/shared/constants";

const GRADIENT_PRESETS = [
  "linear-gradient(135deg, #5e3497 0%, #2a2729 100%)",
  "linear-gradient(135deg, #4d2a7c 0%, #1b181a 100%)",
  "linear-gradient(135deg, #423f42 0%, #2a2729 100%)",
  "linear-gradient(135deg, #7241b8 0%, #423f42 100%)",
  "linear-gradient(135deg, #2a2729 0%, #5e3497 50%, #2a2729 100%)",
  "linear-gradient(135deg, #3d2d4a 0%, #1b181a 100%)",
  "linear-gradient(135deg, #2a2729 0%, #352530 100%)",
  "linear-gradient(135deg, #423f42 0%, #3d2d4a 50%, #2a2729 100%)",
  "linear-gradient(135deg, #8854d4 0%, #2a2729 100%)",
  "linear-gradient(135deg, #1b181a 0%, #423f42 100%)",
  "linear-gradient(135deg, #352530 0%, #423f42 100%)",
  "linear-gradient(135deg, #2a2729 0%, #4d2a7c 50%, #1b181a 100%)",
];

export function CoverPicker({
  currentCover,
  onSelect,
  workspaceId,
  pageId,
  disabled = false,
  title,
}: {
  currentCover: string | null;
  onSelect: (cover: string | null) => void;
  workspaceId: string;
  pageId: string;
  disabled?: boolean;
  title?: string;
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
          disabled={disabled}
          title={title}
          className="rounded-md bg-zinc-800/80 px-2 py-1 text-sm text-zinc-300 opacity-0 transition-opacity hover:bg-zinc-800 group-hover/cover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Change cover
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          disabled={disabled}
          title={title}
          className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Image className="h-4 w-4" />
          <span className="opacity-60 transition-opacity group-hover:opacity-100">Add cover</span>
        </button>
      )}

      <Dialog
        open={open && !disabled}
        onClose={() => setOpen(false)}
        ariaLabelledBy="cover-picker-title"
        className="w-full max-w-sm p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="cover-picker-title" className="text-base font-medium text-zinc-300">
            Cover
          </h2>
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
              aria-label="Close"
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
