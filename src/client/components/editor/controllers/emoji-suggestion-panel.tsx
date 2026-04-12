import { forwardRef, useImperativeHandle, useRef } from "react";
import { FloatingPortal } from "@floating-ui/react";
import type { EmojiItem } from "@tiptap/extension-emoji";
import { useMenuNavigation } from "./menu/navigation";
import { preserveEditorSelectionOnMouseDown, useEditorRectPopover } from "./menu/popover";

export interface EmojiSuggestionPanelProps {
  items: EmojiItem[];
  command: (item: EmojiItem) => void;
  clientRect: (() => DOMRect | null) | null;
  contextElement?: HTMLElement | null;
  onClose?: () => void;
}

export interface EmojiSuggestionPanelHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export const EmojiSuggestionPanel = forwardRef<EmojiSuggestionPanelHandle, EmojiSuggestionPanelProps>(
  ({ items, command, clientRect, contextElement, onClose }, ref) => {
    const panelRef = useRef<HTMLDivElement>(null);
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
          <div className="tiptap-slash-menu-label">Emoji</div>
          {items.length === 0 ? (
            <div className="tiptap-slash-menu-item" aria-disabled>
              <span className="tiptap-emoji-suggestion-glyph">🙂</span>
              <span className="tiptap-emoji-suggestion-meta">No emoji found</span>
            </div>
          ) : (
            items.map((item, index) => (
              <button
                key={`${item.name}-${index}`}
                type="button"
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
      </FloatingPortal>
    );
  },
);
EmojiSuggestionPanel.displayName = "EmojiSuggestionPanel";
