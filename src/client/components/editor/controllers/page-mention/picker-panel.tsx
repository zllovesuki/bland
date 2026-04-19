import { useState, useLayoutEffect, useMemo, useRef, useImperativeHandle, type Ref } from "react";
import { FloatingPortal } from "@floating-ui/react";
import { FileText } from "lucide-react";
import { useMenuNavigation } from "../menu/navigation";
import { preserveEditorSelectionOnMouseDown, useEditorRectPopover } from "../menu/popover";

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
  contextElement?: HTMLElement | null;
  onCancel?: () => void;
  ref?: Ref<PageMentionPickerPanelHandle>;
}

export interface PageMentionPickerPanelHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const MAX_VISIBLE = 20;

function getInternalSelectedIndex(itemCount: number): number {
  return itemCount > 0 ? 0 : -1;
}

export function PageMentionPickerPanel({
  items,
  filterMode,
  command,
  clientRect,
  contextElement,
  onCancel,
  ref,
}: PageMentionPickerPanelProps) {
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxIdRef = useRef(`page-mention-picker-${Math.random().toString(36).slice(2, 10)}`);

  const visibleItems = useMemo(() => {
    if (filterMode === "external" || query.length === 0) {
      return items.slice(0, MAX_VISIBLE);
    }
    const normalizedQuery = query.trim().toLowerCase();
    const nextItems: PageMentionItem[] = [];
    for (const item of items) {
      if (!item.title.toLowerCase().includes(normalizedQuery)) continue;
      nextItems.push(item);
      if (nextItems.length >= MAX_VISIBLE) break;
    }
    return nextItems;
  }, [items, filterMode, query]);

  const navigation = useMenuNavigation({
    items: visibleItems,
    initialIndex: filterMode === "internal" ? getInternalSelectedIndex(visibleItems.length) : 0,
    listRef: panelRef,
    onSelect: command,
  });
  const { floatingStyles, setFloating } = useEditorRectPopover({
    open: true,
    onClose: onCancel,
    getAnchorRect: () => clientRect?.() ?? null,
    contextElement,
    maxHeight: true,
    deferOutsidePress: true,
  });

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

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel?.();
          return true;
        }
        return navigation.onKeyDown(event);
      },
    }),
    [navigation, onCancel],
  );

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel?.();
      return;
    }
    if (navigation.onKeyDown(event.nativeEvent)) {
      event.preventDefault();
    }
  }

  return (
    <FloatingPortal>
      <div
        ref={(node) => {
          setFloating(node);
          panelRef.current = node;
        }}
        className="tiptap-slash-menu tiptap-page-mention-picker"
        style={{ ...floatingStyles, zIndex: 80 }}
        onMouseDownCapture={(event) => {
          // Let native focus reach the search input in internal mode; still
          // swallow mousedown on non-interactive panel chrome so the editor
          // does not lose its selection behind the picker.
          preserveEditorSelectionOnMouseDown(event);
        }}
      >
        {filterMode === "internal" && (
          <div className="tiptap-page-mention-picker-search">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Link to page..."
              className="tiptap-page-mention-picker-input"
              autoFocus
              aria-controls={listboxIdRef.current}
              aria-activedescendant={
                visibleItems.length > 0 && navigation.selectedIndex >= 0
                  ? `${listboxIdRef.current}-option-${navigation.selectedIndex}`
                  : undefined
              }
              aria-expanded="true"
              aria-autocomplete="list"
              aria-label="Filter pages"
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
            visibleItems.map((item, index) => (
              <button
                key={item.pageId}
                id={`${listboxIdRef.current}-option-${index}`}
                type="button"
                data-menu-index={index}
                className="tiptap-slash-menu-item"
                aria-selected={index === navigation.selectedIndex}
                role="option"
                onMouseEnter={() => navigation.setSelectedIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
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
    </FloatingPortal>
  );
}
