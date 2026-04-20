import { useImperativeHandle, useRef, type Ref } from "react";
import { FloatingPortal } from "@floating-ui/react";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";
import { useMenuNavigation } from "../menu/navigation";
import { preserveEditorSelectionOnMouseDown, useEditorRectPopover } from "../menu/popover";
import type { ResolvedSlashMenuItem } from "./items";

export interface SlashMenuPanelProps {
  items: ResolvedSlashMenuItem[];
  command: (item: ResolvedSlashMenuItem) => void;
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
  const handleSelect = (item: ResolvedSlashMenuItem) => {
    if (item.blockedReason) return;
    command(item);
  };
  const navigation = useMenuNavigation({
    items,
    listRef: panelRef,
    onSelect: handleSelect,
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

  const groups: { name: string; items: { item: ResolvedSlashMenuItem; index: number }[] }[] = [];
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
              {group.items.map(({ item, index }) => {
                const disabled = Boolean(item.blockedReason);
                const subtitle = item.blockedReason ?? item.description ?? null;
                return (
                  <button
                    key={index}
                    id={`${listboxIdRef.current}-option-${index}`}
                    type="button"
                    role="option"
                    data-menu-index={index}
                    className="tiptap-slash-menu-item"
                    aria-selected={index === navigation.selectedIndex}
                    aria-disabled={disabled || undefined}
                    title={item.blockedReason ?? undefined}
                    disabled={disabled}
                    onMouseEnter={() => navigation.setSelectedIndex(index)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (disabled) return;
                      command(item);
                    }}
                  >
                    <item.icon size={18} className="shrink-0 text-zinc-400" aria-hidden="true" />
                    <span className="flex min-w-0 flex-col text-left">
                      <span className="truncate">{item.title}</span>
                      {subtitle && (
                        <span
                          className={disabled ? "truncate text-xs text-amber-400/90" : "truncate text-xs text-zinc-500"}
                        >
                          {subtitle}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </FloatingPortal>
  );
}
