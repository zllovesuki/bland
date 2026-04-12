import { forwardRef, useImperativeHandle, useRef } from "react";
import { FloatingPortal } from "@floating-ui/react";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";
import { useMenuNavigation } from "./menu/navigation";
import { preserveEditorSelectionOnMouseDown, useEditorRectPopover } from "./menu/popover";
import type { SlashMenuItem } from "./slash-items";

export interface SlashMenuPanelProps {
  items: SlashMenuItem[];
  command: (item: SlashMenuItem) => void;
  clientRect: (() => DOMRect | null) | null;
  contextElement?: HTMLElement | null;
  onClose?: () => void;
}

export interface SlashMenuPanelHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export const SlashMenuPanel = forwardRef<SlashMenuPanelHandle, SlashMenuPanelProps>(
  ({ items, command, clientRect, contextElement, onClose }, ref) => {
    const panelRef = useRef<HTMLDivElement>(null);
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

    let currentGroup: string | undefined;
    const rows: React.JSX.Element[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.group !== currentGroup) {
        currentGroup = item.group;
        rows.push(
          <div key={`group-${currentGroup}`} className="tiptap-slash-menu-label">
            {currentGroup}
          </div>,
        );
      }
      rows.push(
        <button
          key={i}
          type="button"
          data-menu-index={i}
          className="tiptap-slash-menu-item"
          aria-selected={i === navigation.selectedIndex}
          onMouseEnter={() => navigation.setSelectedIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            command(item);
          }}
        >
          <item.icon size={18} className="shrink-0 text-zinc-400" />
          <span>{item.title}</span>
        </button>,
      );
    }

    return (
      <FloatingPortal>
        <div
          ref={(node) => {
            setFloating(node);
            panelRef.current = node;
          }}
          className="tiptap-slash-menu"
          style={{ ...floatingStyles, zIndex: 80 }}
          onMouseDownCapture={(e) => preserveEditorSelectionOnMouseDown(e)}
        >
          {rows}
        </div>
      </FloatingPortal>
    );
  },
);
SlashMenuPanel.displayName = "SlashMenuPanel";
