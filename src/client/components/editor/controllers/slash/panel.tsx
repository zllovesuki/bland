import { useImperativeHandle, useRef, type Ref } from "react";
import { FloatingPortal } from "@floating-ui/react";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";
import { useMenuNavigation } from "../menu/navigation";
import { preserveEditorSelectionOnMouseDown, useEditorRectPopover } from "../menu/popover";
import type { SlashMenuItem } from "./items";

export interface SlashMenuPanelProps {
  items: SlashMenuItem[];
  command: (item: SlashMenuItem) => void;
  clientRect: (() => DOMRect | null) | null;
  contextElement?: HTMLElement | null;
  onClose?: () => void;
  ref?: Ref<SlashMenuPanelHandle>;
}

export interface SlashMenuPanelHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export function SlashMenuPanel({ items, command, clientRect, contextElement, onClose, ref }: SlashMenuPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const listboxIdRef = useRef(`slash-menu-${Math.random().toString(36).slice(2, 10)}`);
  const navigation = useMenuNavigation({
    items,
    listRef: panelRef,
    onSelect: command,
  });
  const { floatingStyles, setFloating } = useEditorRectPopover({
    open: items.length > 0,
    onClose,
    getAnchorRect: () => clientRect?.() ?? null,
    contextElement,
    maxHeight: true,
    deferOutsidePress: true,
  });

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps) => navigation.onKeyDown(event),
  }));

  if (items.length === 0) return null;

  const groups: { name: string; items: { item: SlashMenuItem; index: number }[] }[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const last = groups[groups.length - 1];
    if (!last || last.name !== item.group) {
      groups.push({ name: item.group, items: [{ item, index: i }] });
    } else {
      last.items.push({ item, index: i });
    }
  }

  return (
    <FloatingPortal>
      <div
        ref={(node) => {
          setFloating(node);
          panelRef.current = node;
        }}
        className="tiptap-slash-menu"
        role="listbox"
        aria-label="Insert block"
        style={{ ...floatingStyles, zIndex: 80 }}
        onMouseDownCapture={(e) => preserveEditorSelectionOnMouseDown(e)}
      >
        {groups.map((group) => {
          const labelId = `${listboxIdRef.current}-group-${group.name}`;
          return (
            <div key={group.name} role="group" aria-labelledby={labelId}>
              <div id={labelId} className="tiptap-slash-menu-label">
                {group.name}
              </div>
              {group.items.map(({ item, index }) => (
                <button
                  key={index}
                  id={`${listboxIdRef.current}-option-${index}`}
                  type="button"
                  role="option"
                  data-menu-index={index}
                  className="tiptap-slash-menu-item"
                  aria-selected={index === navigation.selectedIndex}
                  onMouseEnter={() => navigation.setSelectedIndex(index)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    command(item);
                  }}
                >
                  <item.icon size={18} className="shrink-0 text-zinc-400" aria-hidden="true" />
                  <span>{item.title}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </FloatingPortal>
  );
}
