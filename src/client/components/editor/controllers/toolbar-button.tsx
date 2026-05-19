import { type ReactNode, type Ref } from "react";

interface ToolbarButtonProps {
  ref?: Ref<HTMLButtonElement>;
  active?: boolean;
  disabled?: boolean;
  title: string;
  onActivate: () => void;
  children: ReactNode;
}

// Toolbar buttons live inside Tiptap floating menus (.tiptap-toolbar, .tiptap-link-toolbar, .tiptap-block-menu).
// They MUST use onMouseDown + preventDefault to keep the editor selection from collapsing on press —
// onClick fires too late, after the editor has already responded to focus changes.
export function ToolbarButton({ ref, active, disabled, title, onActivate, children }: ToolbarButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      title={title}
      aria-label={title}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      className={active ? "is-active" : undefined}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled) return;
        onActivate();
      }}
    >
      {children}
    </button>
  );
}
