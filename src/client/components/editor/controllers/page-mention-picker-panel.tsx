import { useState, useEffect, useLayoutEffect, useMemo, useRef, forwardRef, useImperativeHandle } from "react";
import { FileText } from "lucide-react";
import { computePosition, offset, shift, size, flip } from "@floating-ui/dom";
import "../styles/slash-menu.css";

export interface PageMentionItem {
  pageId: string;
  title: string;
  icon: string | null;
}

export type PageMentionFilterMode = "external" | "internal";

export interface PageMentionPickerPanelProps {
  items: PageMentionItem[];
  filterMode: PageMentionFilterMode;
  command: (item: PageMentionItem) => void;
  clientRect: (() => DOMRect | null) | null;
  onCancel?: () => void;
}

export interface PageMentionPickerPanelHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const MAX_VISIBLE = 20;

function getInternalSelectedIndex(itemCount: number): number {
  return itemCount > 0 ? 0 : -1;
}

export const PageMentionPickerPanel = forwardRef<PageMentionPickerPanelHandle, PageMentionPickerPanelProps>(
  ({ items, filterMode, command, clientRect, onCancel }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(
      filterMode === "internal" ? getInternalSelectedIndex(items.length) : 0,
    );
    const [query, setQuery] = useState("");
    const panelRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listboxIdRef = useRef(`page-mention-picker-${Math.random().toString(36).slice(2, 10)}`);

    const visibleItems = useMemo(() => {
      if (filterMode === "external" || query.length === 0) {
        return items.slice(0, MAX_VISIBLE);
      }
      const q = query.trim().toLowerCase();
      const out: PageMentionItem[] = [];
      for (const item of items) {
        if (!item.title.toLowerCase().includes(q)) continue;
        out.push(item);
        if (out.length >= MAX_VISIBLE) break;
      }
      return out;
    }, [items, filterMode, query]);

    const visibleItemsRef = useRef(visibleItems);
    visibleItemsRef.current = visibleItems;
    const selectedIndexRef = useRef(selectedIndex);
    selectedIndexRef.current = selectedIndex;

    useEffect(() => {
      setSelectedIndex(filterMode === "internal" ? getInternalSelectedIndex(visibleItems.length) : 0);
    }, [filterMode, visibleItems]);

    useLayoutEffect(() => {
      if (filterMode !== "internal") return;

      const focusInput = () => {
        const input = inputRef.current;
        if (!input) return;
        input.focus();
        const end = input.value.length;
        input.setSelectionRange(end, end);
      };

      focusInput();
      const rafId = window.requestAnimationFrame(focusInput);
      return () => window.cancelAnimationFrame(rafId);
    }, [filterMode]);

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
    }, [visibleItems, clientRect]);

    useEffect(() => {
      const el = panelRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    // Stable onKeyDown for the external ([[) path, reading current state through refs.
    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: (event: KeyboardEvent) => {
          const currentItems = visibleItemsRef.current;
          const currentIndex = selectedIndexRef.current;
          if (currentItems.length === 0) {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel?.();
              return true;
            }
            return false;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex((i) => (i < 0 ? currentItems.length - 1 : i <= 0 ? currentItems.length - 1 : i - 1));
            return true;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex((i) => (i < 0 ? 0 : i >= currentItems.length - 1 ? 0 : i + 1));
            return true;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const item = currentItems[currentIndex];
            if (item) command(item);
            return true;
          }
          return false;
        },
      }),
      [command],
    );

    function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
      if (visibleItems.length === 0) {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel?.();
          return;
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((i) => (i < 0 ? visibleItems.length - 1 : i <= 0 ? visibleItems.length - 1 : i - 1));
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((i) => (i < 0 ? 0 : i >= visibleItems.length - 1 ? 0 : i + 1));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const item = selectedIndex >= 0 ? visibleItems[selectedIndex] : visibleItems[0];
        if (item) command(item);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel?.();
        return;
      }
    }

    return (
      <div
        ref={panelRef}
        className="tiptap-slash-menu tiptap-page-mention-picker"
        style={{ position: "fixed", zIndex: 80 }}
        onMouseDownCapture={(e) => {
          // Let native focus reach the search input in internal mode; still
          // swallow mousedown on non-interactive panel chrome so the editor
          // does not lose its selection behind the picker.
          if (e.target instanceof HTMLInputElement) return;
          e.preventDefault();
        }}
      >
        {filterMode === "internal" && (
          <div className="tiptap-page-mention-picker-search">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Link to page..."
              className="tiptap-page-mention-picker-input"
              autoFocus
              aria-controls={listboxIdRef.current}
              aria-activedescendant={
                visibleItems.length > 0 && selectedIndex >= 0
                  ? `${listboxIdRef.current}-option-${selectedIndex}`
                  : undefined
              }
              aria-expanded="true"
              aria-autocomplete="list"
              role="combobox"
            />
          </div>
        )}
        <div className="tiptap-slash-menu-label">{filterMode === "internal" ? "Pages" : "Link to page"}</div>
        <div id={listboxIdRef.current} role="listbox" aria-label="Page mentions">
          {visibleItems.length === 0 ? (
            <div className="tiptap-slash-menu-item" aria-disabled role="option">
              <FileText size={18} className="shrink-0 text-zinc-400" />
              <span>No pages found</span>
            </div>
          ) : (
            visibleItems.map((item, i) => (
              <button
                key={item.pageId}
                id={`${listboxIdRef.current}-option-${i}`}
                type="button"
                data-index={i}
                className="tiptap-slash-menu-item"
                aria-selected={i === selectedIndex}
                role="option"
                onMouseEnter={() => setSelectedIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  command(item);
                }}
              >
                {item.icon ? (
                  <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-base leading-none">
                    {item.icon}
                  </span>
                ) : (
                  <FileText size={18} className="shrink-0 text-zinc-400" />
                )}
                <span>{item.title}</span>
              </button>
            ))
          )}
        </div>
      </div>
    );
  },
);
PageMentionPickerPanel.displayName = "PageMentionPickerPanel";
