import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { computePosition, offset, shift, size, flip } from "@floating-ui/dom";
import type { EmojiItem } from "@tiptap/extension-emoji";
import "../styles/slash-menu.css";

export interface EmojiSuggestionPanelProps {
  items: EmojiItem[];
  command: (item: EmojiItem) => void;
  clientRect: (() => DOMRect | null) | null;
}

export interface EmojiSuggestionPanelHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export const EmojiSuggestionPanel = forwardRef<EmojiSuggestionPanelHandle, EmojiSuggestionPanelProps>(
  ({ items, command, clientRect }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useEffect(() => {
      const panel = panelRef.current;
      if (!panel || !clientRect) return;

      const virtualEl = {
        getBoundingClientRect: () => clientRect() ?? new DOMRect(),
      };

      void computePosition(virtualEl, panel, {
        placement: "bottom-start",
        middleware: [
          offset(10),
          shift({ padding: 10 }),
          flip({ padding: 10 }),
          size({
            apply({ elements, availableHeight }) {
              elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
            },
            padding: 10,
          }),
        ],
      }).then(({ x, y }) => {
        panel.style.left = `${x}px`;
        panel.style.top = `${y}px`;
      });
    }, [items, clientRect]);

    useEffect(() => {
      const el = panelRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (items.length === 0) return false;

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedIndex((index) => (index <= 0 ? items.length - 1 : index - 1));
          return true;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedIndex((index) => (index >= items.length - 1 ? 0 : index + 1));
          return true;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const item = items[selectedIndex];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    return (
      <div
        ref={panelRef}
        className="tiptap-slash-menu"
        style={{ position: "fixed", zIndex: 80 }}
        onMouseDownCapture={(event) => event.preventDefault()}
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
              data-index={index}
              className="tiptap-slash-menu-item"
              aria-selected={index === selectedIndex}
              onMouseEnter={() => setSelectedIndex(index)}
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
    );
  },
);
EmojiSuggestionPanel.displayName = "EmojiSuggestionPanel";
