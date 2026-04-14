import { useState, useRef, useCallback } from "react";
import { SmilePlus, X } from "lucide-react";
import { useClickOutside } from "@/client/hooks/use-click-outside";
import { EmojiPicker } from "@/client/components/ui/emoji-picker";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";

export function IconPicker({
  currentIcon,
  onSelect,
}: {
  currentIcon: string | null;
  onSelect: (icon: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useClickOutside(
    panelRef,
    useCallback(() => setOpen(false), []),
    open,
  );

  return (
    <div className="relative">
      {currentIcon ? (
        <div className="group/icon flex items-center gap-0.5">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center rounded-md px-2 py-1 transition-colors hover:bg-zinc-800"
            aria-label="Change icon"
          >
            <EmojiIcon emoji={currentIcon} size={28} />
          </button>
          <button
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 opacity-0 transition-colors hover:bg-zinc-800 hover:text-zinc-300 group-hover/icon:opacity-100"
            aria-label="Remove icon"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
        >
          <SmilePlus className="h-4 w-4" />
          <span className="opacity-60 transition-opacity group-hover:opacity-100">Add icon</span>
        </button>
      )}

      {open && (
        <div ref={panelRef} className="absolute left-0 top-full z-30 mt-1">
          <EmojiPicker
            onSelect={(emoji) => {
              onSelect(emoji);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
