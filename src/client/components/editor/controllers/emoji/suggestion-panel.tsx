import { useImperativeHandle, useRef, type Ref } from "react";
import { FloatingPortal } from "@floating-ui/react";
import type { EmojiItem } from "@tiptap/extension-emoji";
import { useMenuNavigation } from "../menu/navigation";
import { preserveEditorSelectionOnMouseDown, useEditorRectPopover } from "../menu/popover";

export interface EmojiSuggestionPanelProps {
  items: EmojiItem[];
  command: (item: EmojiItem) => void;
  clientRect: (() => DOMRect | null) | null;
  contextElement?: HTMLElement | null;
  onClose?: () => void;
  ref?: Ref<EmojiSuggestionPanelHandle>;
}

export interface EmojiSuggestionPanelHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export function EmojiSuggestionPanel({
  items,
  command,
  clientRect,
  contextElement,
  onClose,
  ref,
}: EmojiSuggestionPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const listboxIdRef = useRef(`emoji-suggestion-${Math.random().toString(36).slice(2, 10)}`);
  const navigation = useMenuNavigation({
    items,
    listRef: panelRef,
    onSelect: command,
  });
  const { floatingStyles, setFloating } = useEditorRectPopover({
    open: true,
    onClose,
    getAnchorRect: () => clientRect?.() ?? null,
    contextElement,
    maxHeight: true,
    deferOutsidePress: true,
  });

  useImperativeHandle(ref, () => ({
    onKeyDown: (event: KeyboardEvent) => navigation.onKeyDown(event),
  }));

  return (
    <FloatingPortal>
      <div
        ref={(node) => {
          setFloating(node);
          panelRef.current = node;
        }}
        className="tiptap-slash-menu"
        style={{ ...floatingStyles, zIndex: 80 }}
        onMouseDownCapture={(event) => preserveEditorSelectionOnMouseDown(event)}
      >
        <div className="tiptap-slash-menu-label" id={`${listboxIdRef.current}-label`}>
          Emoji
        </div>
        <div id={listboxIdRef.current} role="listbox" aria-labelledby={`${listboxIdRef.current}-label`}>
          {items.length === 0 ? (
            <div className="tiptap-slash-menu-item" role="option" aria-disabled aria-selected="false">
              <span className="tiptap-emoji-suggestion-glyph">🙂</span>
              <span className="tiptap-emoji-suggestion-meta">No emoji found</span>
            </div>
          ) : (
            items.map((item, index) => (
              <button
                key={`${item.name}-${index}`}
                id={`${listboxIdRef.current}-option-${index}`}
                type="button"
                role="option"
                data-menu-index={index}
                className="tiptap-slash-menu-item"
                aria-selected={index === navigation.selectedIndex}
                onMouseEnter={() => navigation.setSelectedIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  command(item);
                }}
              >
                {item.fallbackImage ? (
                  <img
                    src={item.fallbackImage}
                    alt=""
                    className="tiptap-emoji-suggestion-glyph tiptap-emoji-suggestion-glyph-image"
                  />
                ) : (
                  <span className="tiptap-emoji-suggestion-glyph">{item.emoji ?? "🙂"}</span>
                )}
                <span className="tiptap-emoji-suggestion-meta">:{item.shortcodes[0] ?? item.name}:</span>
              </button>
            ))
          )}
        </div>
      </div>
    </FloatingPortal>
  );
}
