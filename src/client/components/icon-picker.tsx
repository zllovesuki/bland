import { useState, useRef } from "react";
import { SmilePlus, X } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { DropdownPortal } from "@/client/components/ui/dropdown-portal";
import { EmojiPicker } from "@/client/components/ui/emoji-picker";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";

export function IconPicker({
  currentIcon,
  onSelect,
  disabled = false,
  title,
}: {
  currentIcon: string | null;
  onSelect: (icon: string | null) => void;
  disabled?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      {currentIcon ? (
        <div className="group/icon flex items-center gap-0.5">
          <button
            ref={triggerRef}
            onClick={() => setOpen((o) => !o)}
            disabled={disabled}
            title={title}
            className="flex items-center rounded-md px-2 py-1 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Change icon"
          >
            <EmojiIcon emoji={currentIcon} size={28} />
          </button>
          <button
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
            disabled={disabled}
            title={title}
            className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 opacity-0 transition hover:bg-zinc-700 hover:text-zinc-100 group-hover/icon:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Remove icon"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <Button
          ref={triggerRef}
          variant="subtle"
          size="xs"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          title={title}
          icon={<SmilePlus className="h-4 w-4" />}
        >
          Add icon
        </Button>
      )}

      {open && !disabled && (
        <DropdownPortal
          triggerRef={triggerRef}
          align="left"
          width={360}
          onClose={() => setOpen(false)}
          className="border-0 bg-transparent shadow-none"
        >
          <EmojiPicker
            onSelect={(emoji) => {
              onSelect(emoji);
              setOpen(false);
            }}
          />
        </DropdownPortal>
      )}
    </>
  );
}
