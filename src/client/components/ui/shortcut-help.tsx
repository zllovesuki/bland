import { Dialog } from "./dialog";

const IS_MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
const MOD = IS_MAC ? "\u2318" : "Ctrl";

interface ShortcutGroup {
  label: string;
  shortcuts: { keys: string; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "General",
    shortcuts: [
      { keys: `${MOD} K`, description: "Search pages" },
      { keys: "/", description: "Insert block (in editor)" },
      { keys: "?", description: "Keyboard shortcuts" },
      { keys: "Esc", description: "Close dialog / deselect" },
    ],
  },
  {
    label: "Editor",
    shortcuts: [
      { keys: `${MOD} B`, description: "Bold" },
      { keys: `${MOD} I`, description: "Italic" },
      { keys: `${MOD} U`, description: "Underline" },
      { keys: `${MOD} E`, description: "Inline code" },
      { keys: `${MOD} Z`, description: "Undo" },
      { keys: IS_MAC ? "\u2318 \u21e7 Z" : "Ctrl Shift Z", description: "Redo" },
    ],
  },
];

interface ShortcutHelpProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  return (
    <Dialog open={open} onClose={onClose} className="w-full max-w-sm p-4">
      <h2 className="mb-3 text-sm font-semibold text-zinc-200">Keyboard shortcuts</h2>
      <div className="space-y-4">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-500">{group.label}</p>
            <div className="space-y-2">
              {group.shortcuts.map((s) => (
                <div key={s.keys} className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">{s.description}</span>
                  <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-400">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
