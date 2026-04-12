import { useCallback, useContext, useLayoutEffect, useRef, useState } from "react";
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { DropdownPortal } from "@/client/components/ui/dropdown-portal";
import { EditorContext } from "../../editor-context";
import { CODE_LANGUAGES, resolveLanguage } from "./shared";
import "../../styles/code-block.css";

export function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const { readOnly } = useContext(EditorContext);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  const language = resolveLanguage(node.attrs.language);
  const displayName = CODE_LANGUAGES[language]?.name ?? "Plain Text";

  const selectLanguage = useCallback(
    (lang: string) => {
      updateAttributes({ language: lang });
      setOpen(false);
    },
    [updateAttributes],
  );

  useLayoutEffect(() => {
    if (!open) return;

    const menu = menuRef.current;
    const activeItem = activeItemRef.current;
    if (!menu || !activeItem) return;

    const targetScrollTop = activeItem.offsetTop - (menu.clientHeight - activeItem.offsetHeight) / 2;
    menu.scrollTop = Math.max(0, targetScrollTop);
  }, [language, open]);

  return (
    <NodeViewWrapper className="tiptap-code-block-wrapper">
      <button
        ref={btnRef}
        type="button"
        className="tiptap-code-block-lang-btn"
        onClick={() => !readOnly && setOpen((p) => !p)}
        onMouseDown={(e) => e.preventDefault()}
        contentEditable={false}
        aria-label={`Language: ${displayName}`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {displayName}
      </button>

      {open && (
        <DropdownPortal triggerRef={btnRef} align="right" width={160} onClose={() => setOpen(false)}>
          <div ref={menuRef} className="tiptap-code-block-lang-dropdown" role="menu" aria-label="Code block language">
            {Object.entries(CODE_LANGUAGES).map(([id, meta]) => (
              <button
                key={id}
                ref={id === language ? activeItemRef : null}
                type="button"
                className={`tiptap-code-block-lang-item${id === language ? " is-active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectLanguage(id)}
                role="menuitemradio"
                aria-checked={id === language}
              >
                {meta.name}
              </button>
            ))}
          </div>
        </DropdownPortal>
      )}

      <pre className="tiptap-code-block-pre" spellCheck={false}>
        <NodeViewContent<"code"> as="code" className="tiptap-code-block-content" style={{ whiteSpace: "inherit" }} />
      </pre>
    </NodeViewWrapper>
  );
}
