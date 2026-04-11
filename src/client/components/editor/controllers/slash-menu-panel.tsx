import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";
import { computePosition, offset, shift, size, flip } from "@floating-ui/dom";
import type { SlashMenuItem } from "./slash-items";
import "../styles/slash-menu.css";

export interface SlashMenuPanelProps {
  items: SlashMenuItem[];
  command: (item: SlashMenuItem) => void;
  clientRect: (() => DOMRect | null) | null;
}

export interface SlashMenuPanelHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export const SlashMenuPanel = forwardRef<SlashMenuPanelHandle, SlashMenuPanelProps>(
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
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
          return true;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedIndex((i) => (i >= items.length - 1 ? 0 : i + 1));
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
          data-index={i}
          className="tiptap-slash-menu-item"
          aria-selected={i === selectedIndex}
          onMouseEnter={() => setSelectedIndex(i)}
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
      <div
        ref={panelRef}
        className="tiptap-slash-menu"
        style={{ position: "fixed", zIndex: 80 }}
        onMouseDownCapture={(e) => e.preventDefault()}
      >
        {rows}
      </div>
    );
  },
);
SlashMenuPanel.displayName = "SlashMenuPanel";
