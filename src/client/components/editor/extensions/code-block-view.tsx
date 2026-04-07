import { useContext, useEffect, useRef, useState, useCallback } from "react";
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { DropdownPortal } from "@/client/components/ui/dropdown-portal";
import { EditorContext } from "../editor-context";
import { CODE_LANGUAGES, resolveLanguage } from "./code-block-shared";

export function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const { readOnly } = useContext(EditorContext);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const language = resolveLanguage(node.attrs.language);
  const displayName = CODE_LANGUAGES[language]?.name ?? "Plain Text";

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectLanguage = useCallback(
    (lang: string) => {
      updateAttributes({ language: lang });
      setOpen(false);
    },
    [updateAttributes],
  );

  return (
    <NodeViewWrapper className="tiptap-code-block-wrapper">
      <button
        ref={btnRef}
        type="button"
        className="tiptap-code-block-lang-btn"
        onClick={() => !readOnly && setOpen((p) => !p)}
        contentEditable={false}
        aria-label={`Language: ${displayName}`}
      >
        {displayName}
      </button>

      {open && (
        <DropdownPortal triggerRef={btnRef} align="right" width={160}>
          <div ref={dropdownRef} className="tiptap-code-block-lang-dropdown">
            {Object.entries(CODE_LANGUAGES).map(([id, meta]) => (
              <button
                key={id}
                type="button"
                className={`tiptap-code-block-lang-item${id === language ? " is-active" : ""}`}
                onClick={() => selectLanguage(id)}
              >
                {meta.name}
              </button>
            ))}
          </div>
        </DropdownPortal>
      )}

      <pre className="tiptap-code-block-pre" spellCheck={false}>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
