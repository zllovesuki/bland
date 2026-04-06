import { useState, useRef, useCallback } from "react";
import { SmilePlus, X } from "lucide-react";
import { useClickOutside } from "@/client/hooks/use-click-outside";

const EMOJI_GROUPS = [
  ["📄", "📝", "📋", "📑", "📰", "🗒️", "📓", "📔", "📕", "📖", "📗", "📘", "📙", "📚"],
  ["🎯", "🚀", "💡", "⭐", "🔥", "✨", "💫", "🎨", "🎭", "🎪", "🎬", "🎮", "🎲", "🧩"],
  ["🏠", "🏢", "🏗️", "🌍", "🌎", "🌏", "🌐", "🗺️", "🧭", "⛰️", "🌋", "🏔️", "🏕️", "🏖️"],
  ["💻", "🖥️", "⌨️", "🖱️", "📱", "📲", "☎️", "📞", "📟", "📠", "🔌", "🔋", "💾", "💿"],
  ["📊", "📈", "📉", "🗂️", "📁", "📂", "🗃️", "🗄️", "📎", "🖇️", "📐", "📏", "✂️", "📌"],
  ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓"],
  ["✅", "❌", "⚠️", "🔔", "🔕", "📢", "📣", "💬", "💭", "🗯️", "🔍", "🔎", "🔒", "🔓"],
  ["🐛", "🐞", "🦋", "🐌", "🐙", "🦊", "🐱", "🐶", "🐻", "🐼", "🦁", "🐯", "🐸", "🐵"],
];

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
      <button
        onClick={() => setOpen((o) => !o)}
        className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
      >
        {currentIcon ? (
          <span className="text-2xl">{currentIcon}</span>
        ) : (
          <>
            <SmilePlus className="h-4 w-4" />
            <span className="opacity-0 group-hover:opacity-100">Add icon</span>
          </>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full z-30 mt-1 w-72 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Pick an icon</span>
            {currentIcon && (
              <button
                onClick={() => {
                  onSelect(null);
                  setOpen(false);
                }}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
              >
                <X className="h-3 w-3" />
                Remove
              </button>
            )}
          </div>
          <div className="grid max-h-48 grid-cols-7 gap-0.5 overflow-y-auto">
            {EMOJI_GROUPS.flat().map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onSelect(emoji);
                  setOpen(false);
                }}
                className={`flex h-8 w-8 items-center justify-center rounded text-lg transition hover:bg-zinc-800 ${
                  currentIcon === emoji ? "bg-zinc-800 ring-1 ring-accent-500" : ""
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
