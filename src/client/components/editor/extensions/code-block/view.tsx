import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { FloatingPortal } from "@floating-ui/react";
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Check, Copy } from "lucide-react";
import { preserveEditorSelectionOnMouseDown, useEditorPopover } from "../../controllers/menu/popover";
import { useEditorAffordance } from "../../editor-affordance-context";
import { useCopyFeedback } from "@/client/hooks/use-copy-feedback";
import { CODE_LANGUAGES, resolveLanguage } from "./shared";
import "../../styles/code-block.css";

export function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const { documentEditable } = useEditorAffordance();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const copyId = useId();
  const { copiedId, copy } = useCopyFeedback<string>();
  const isCopied = copiedId === copyId;

  const language = resolveLanguage(node.attrs.language);
  const displayName = CODE_LANGUAGES[language]?.name ?? "Plain Text";
  const { floatingStyles, getFloatingProps, refs } = useEditorPopover({
    open,
    onClose: () => setOpen(false),
    anchorRef: btnRef,
    placement: "bottom-end",
    offset: 4,
    padding: 8,
  });

  const selectLanguage = useCallback(
    (lang: string) => {
      updateAttributes({ language: lang });
      setOpen(false);
    },
    [updateAttributes],
  );

  useLayoutEffect(() => {
    if (!open) return;

    let frameId = 0;

    frameId = window.requestAnimationFrame(() => {
      const dropdown = dropdownRef.current;
      const activeItem = activeItemRef.current;
      if (!dropdown || !activeItem) return;

      const maxScrollTop = Math.max(0, dropdown.scrollHeight - dropdown.clientHeight);
      const targetScrollTop = activeItem.offsetTop - (dropdown.clientHeight - activeItem.offsetHeight) / 2;

      dropdown.scrollTop = Math.min(maxScrollTop, Math.max(0, targetScrollTop));
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [language, open]);

  return (
    <NodeViewWrapper className="tiptap-code-block-wrapper">
      <div className="tiptap-code-block-controls" contentEditable={false}>
        <button
          type="button"
          className="tiptap-code-block-copy-btn"
          onClick={() => copy(copyId, node.textContent)}
          onMouseDown={(e) => e.preventDefault()}
          aria-label={isCopied ? "Code copied" : "Copy code"}
          title={isCopied ? "Code copied" : "Copy code"}
        >
          {isCopied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button
          ref={btnRef}
          type="button"
          className="tiptap-code-block-lang-btn"
          onClick={() => documentEditable && setOpen((p) => !p)}
          onMouseDown={(e) => e.preventDefault()}
          aria-label={documentEditable ? `Language: ${displayName}. Click to change.` : `Language: ${displayName}`}
          aria-expanded={documentEditable ? open : undefined}
          aria-haspopup={documentEditable ? "menu" : undefined}
          disabled={!documentEditable}
        >
          {displayName}
        </button>
      </div>

      {open && (
        <FloatingPortal>
          <div
            ref={(node) => {
              refs.setFloating(node);
            }}
            className="animate-fade-in origin-top-right tiptap-menu-surface"
            role="menu"
            aria-label="Code block language"
            style={{ ...floatingStyles, width: 160, zIndex: 50 }}
            {...getFloatingProps({
              onMouseDownCapture: (e) => preserveEditorSelectionOnMouseDown(e),
            })}
          >
            <div ref={dropdownRef} className="tiptap-code-block-lang-dropdown">
              {Object.entries(CODE_LANGUAGES).map(([id, meta]) => (
                <button
                  key={id}
                  ref={id === language ? activeItemRef : null}
                  type="button"
                  className={`tiptap-menu-item tiptap-code-block-lang-item${id === language ? " is-active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectLanguage(id)}
                  role="menuitemradio"
                  aria-checked={id === language}
                >
                  {meta.name}
                </button>
              ))}
            </div>
          </div>
        </FloatingPortal>
      )}

      <pre className="tiptap-code-block-pre" spellCheck={false}>
        <NodeViewContent<"code"> as="code" className="tiptap-code-block-content" style={{ whiteSpace: "inherit" }} />
      </pre>
    </NodeViewWrapper>
  );
}
