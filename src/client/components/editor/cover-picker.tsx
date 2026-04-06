import { useState, useRef, useCallback } from "react";
import { Image, X, Upload } from "lucide-react";
import { uploadFile } from "@/client/lib/uploads";
import { UPLOAD_MIME_SET } from "@/shared/types";

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
        // silent — toast system deferred to M5
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
          className="rounded-md bg-zinc-900/80 px-2 py-1 text-xs text-zinc-300 opacity-0 transition hover:bg-zinc-900 group-hover/cover:opacity-100"
        >
          Change cover
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-500 opacity-0 transition hover:bg-zinc-800 hover:text-zinc-300 group-hover/actions:opacity-100"
        >
          <Image className="h-4 w-4" />
          <span>Add cover</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
          <div className="fixed inset-0 bg-black/60" />
          <div
            className="relative w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-300">Cover</span>
              <div className="flex items-center gap-2">
                {currentCover && (
                  <button
                    onClick={() => {
                      onSelect(null);
                      setOpen(false);
                    }}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                  >
                    <X className="h-3 w-3" />
                    Remove
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="rounded p-0.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mb-4">
              <span className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Gradients
              </span>
              <div className="grid grid-cols-4 gap-2">
                {GRADIENT_PRESETS.map((gradient) => (
                  <button
                    key={gradient}
                    onClick={() => {
                      onSelect(gradient);
                      setOpen(false);
                    }}
                    className={`h-12 rounded-md transition hover:ring-2 hover:ring-accent-500 ${
                      currentCover === gradient ? "ring-2 ring-accent-500" : ""
                    }`}
                    style={{ background: gradient }}
                  />
                ))}
              </div>
            </div>

            <div>
              <span className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Upload image
              </span>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-zinc-700 py-4 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-300 disabled:opacity-50"
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
          </div>
        </div>
      )}
    </>
  );
}
