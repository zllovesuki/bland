import { FloatingPortal } from "@floating-ui/react";
import { preserveEditorSelectionOnMouseDown, useEditorRectPopover } from "./menu/popover";
import type { AiRewriteAction } from "@/shared/types";
import "../styles/ai-menu.css";

export interface AiRewriteOption {
  action: AiRewriteAction;
  label: string;
  description: string;
}

export const AI_REWRITE_OPTIONS: AiRewriteOption[] = [
  { action: "proofread", label: "Proofread", description: "Fix grammar and spelling" },
  { action: "formal", label: "Formal", description: "More professional tone" },
  { action: "casual", label: "Casual", description: "More conversational tone" },
  { action: "simplify", label: "Simplify", description: "Make it easier to read" },
  { action: "expand", label: "Expand", description: "Add more detail" },
];

interface AiMenuPanelProps {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onSelect: (action: AiRewriteAction) => void;
  onClose: () => void;
}

export function AiMenuPanel({ triggerRef, onSelect, onClose }: AiMenuPanelProps) {
  const { floatingStyles, setFloating } = useEditorRectPopover({
    open: true,
    onClose,
    contextElement: () => triggerRef.current,
    getAnchorRect: () => triggerRef.current?.getBoundingClientRect() ?? null,
    offset: 6,
  });

  return (
    <FloatingPortal>
      <div
        ref={setFloating}
        className="tiptap-menu-surface tiptap-ai-menu"
        style={{ ...floatingStyles, zIndex: 60 }}
        onMouseDownCapture={(e) => preserveEditorSelectionOnMouseDown(e)}
        role="menu"
      >
        {AI_REWRITE_OPTIONS.map((option) => (
          <button
            key={option.action}
            type="button"
            role="menuitem"
            className="tiptap-ai-menu-item"
            aria-label={option.label}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(option.action);
            }}
          >
            <span className="tiptap-ai-menu-label">{option.label}</span>
            <span className="tiptap-ai-menu-desc">{option.description}</span>
          </button>
        ))}
      </div>
    </FloatingPortal>
  );
}
