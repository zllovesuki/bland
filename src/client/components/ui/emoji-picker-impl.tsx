import { useCallback, useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import "@/client/styles/emoji-picker.css";
import { PICKER_EMOJI_ITEMS, PICKER_GROUP_ORDER, type PickerEmojiItem } from "@/client/lib/emoji/picker-data";
import { normalizeEmoji } from "@/client/lib/emoji/shared";
import { readRecentEmojis, writeRecentEmoji } from "@/client/lib/emoji/recents";
import { useMenuNavigation } from "@/client/components/editor/controllers/menu/navigation";
import { EmojiIcon } from "./emoji-icon";

interface EmojiPickerImplProps {
  onSelect: (emoji: string) => void;
  className?: string;
  style?: CSSProperties;
}

type ActiveGroup = "recent" | (typeof PICKER_GROUP_ORDER)[number];

const VISIBLE_GROUPS: ActiveGroup[] = ["recent", ...PICKER_GROUP_ORDER];

const GROUP_LABELS: Record<ActiveGroup, string> = {
  recent: "Recent",
  "smileys & emotion": "Smileys",
  "people & body": "People",
  "animals & nature": "Nature",
  "food & drink": "Food",
  "travel & places": "Travel",
  activities: "Activity",
  objects: "Objects",
  symbols: "Symbols",
  flags: "Flags",
};

const GROUP_GLYPHS: Record<ActiveGroup, string> = {
  recent: "🕐",
  "smileys & emotion": "😀",
  "people & body": "👋",
  "animals & nature": "🐶",
  "food & drink": "🍔",
  "travel & places": "✈️",
  activities: "⚽",
  objects: "💡",
  symbols: "🔣",
  flags: "🏁",
};

const PICKER_EMOJIS_BY_GROUP = PICKER_GROUP_ORDER.reduce<Record<string, PickerEmojiItem[]>>((groups, group) => {
  groups[group] = PICKER_EMOJI_ITEMS.filter((item) => item.group === group);
  return groups;
}, {});

function getEmojiSearchTerms(item: PickerEmojiItem): string[] {
  const expandedTerms = [item.name, ...item.shortcodes, ...item.tags].filter(Boolean).flatMap((term) => {
    const normalizedTerm = term.toLowerCase();
    const spacedTerm = normalizedTerm.replace(/[_+-]+/g, " ");
    return normalizedTerm === spacedTerm ? [normalizedTerm] : [normalizedTerm, spacedTerm];
  });
  return expandedTerms;
}

function recentsToItems(recents: string[]): PickerEmojiItem[] {
  return recents.map((raw, index) => ({
    emoji: normalizeEmoji(raw),
    rawEmoji: raw,
    name: `recent-${index}-${raw}`,
    shortcodes: [],
    tags: [],
    group: "recent",
  }));
}

function resolveDisplayEmoji(item: PickerEmojiItem): string {
  return item.rawEmoji ?? item.emoji ?? "";
}

function measureColumnCount(grid: HTMLElement | null): number {
  if (!grid) return 1;
  const items = grid.querySelectorAll<HTMLElement>("[data-menu-index]");
  if (items.length <= 1) return Math.max(1, items.length);
  const firstTop = items[0].offsetTop;
  let count = 0;
  for (const item of items) {
    if (item.offsetTop !== firstTop) break;
    count++;
  }
  return Math.max(1, count);
}

export function EmojiPickerImpl({ onSelect, className, style }: EmojiPickerImplProps) {
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>(() => readRecentEmojis());
  const [activeGroup, setActiveGroup] = useState<ActiveGroup>(() =>
    readRecentEmojis().length > 0 ? "recent" : "smileys & emotion",
  );
  const [columns, setColumns] = useState(1);

  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const isSearching = normalizedQuery !== "";

  const gridRef = useRef<HTMLDivElement>(null);

  const visibleEmojis: PickerEmojiItem[] = useMemo(() => {
    if (isSearching) {
      return PICKER_EMOJI_ITEMS.filter((item) =>
        getEmojiSearchTerms(item).some((term) => term.includes(normalizedQuery)),
      );
    }
    if (activeGroup === "recent") {
      return recentsToItems(recents);
    }
    return PICKER_EMOJIS_BY_GROUP[activeGroup] ?? [];
  }, [activeGroup, isSearching, normalizedQuery, recents]);

  const sectionLabel = isSearching
    ? `${visibleEmojis.length} result${visibleEmojis.length === 1 ? "" : "s"}`
    : GROUP_LABELS[activeGroup];

  const handleSelect = useCallback(
    (item: PickerEmojiItem) => {
      const emoji = resolveDisplayEmoji(item);
      if (!emoji) return;
      setRecents(writeRecentEmoji(emoji));
      onSelect(emoji);
    },
    [onSelect],
  );

  const gridNav = useMenuNavigation<PickerEmojiItem>({
    items: visibleEmojis,
    listRef: gridRef,
    onSelect: handleSelect,
    columns,
  });

  useLayoutEffect(() => {
    if (!gridRef.current) return;
    const grid = gridRef.current;
    const update = () => setColumns(measureColumnCount(grid));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [visibleEmojis]);

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const input = event.currentTarget;
        const caret = input.selectionStart;
        const collapsed = caret !== null && caret === input.selectionEnd;
        const atBoundary = collapsed && (event.key === "ArrowLeft" ? caret === 0 : caret === input.value.length);
        if (!atBoundary) return;
      } else if (!["ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
        return;
      }

      if (gridNav.onKeyDown(event.nativeEvent)) {
        event.preventDefault();
      }
    },
    [gridNav],
  );

  return (
    <div className={["bland-emoji-picker", className].filter(Boolean).join(" ")} style={style}>
      <div className="bland-emoji-picker-search-row">
        <input
          type="search"
          className="bland-emoji-picker-search"
          placeholder="Search emoji..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleSearchKeyDown}
          autoFocus
        />
      </div>

      <div className="bland-emoji-picker-body">
        <div className="bland-emoji-picker-section-label">{sectionLabel}</div>
        {visibleEmojis.length === 0 ? (
          <div className="bland-emoji-picker-empty">
            {isSearching ? "Nothing matches. Try fewer letters." : "No emoji here yet."}
          </div>
        ) : (
          <div
            ref={gridRef}
            className="bland-emoji-picker-grid"
            role="tabpanel"
            aria-label={isSearching ? "Emoji search results" : GROUP_LABELS[activeGroup]}
          >
            {visibleEmojis.map((item, index) => {
              const nextEmoji = resolveDisplayEmoji(item);
              const shortcodeTitle = item.shortcodes[0] ? `:${item.shortcodes[0]}:` : item.name;
              return (
                <button
                  key={item.name}
                  type="button"
                  data-menu-index={index}
                  className="bland-emoji-picker-item"
                  title={shortcodeTitle}
                  aria-selected={gridNav.selectedIndex === index}
                  onMouseEnter={() => gridNav.setSelectedIndex(index)}
                  onClick={() => handleSelect(item)}
                >
                  <EmojiIcon emoji={nextEmoji} size={20} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="bland-emoji-picker-groups" role="tablist" aria-label="Emoji categories">
        {VISIBLE_GROUPS.map((group) => {
          const tabId = `bland-emoji-tab-${group.replace(/\s|&/g, "-")}`;
          const isActive = !isSearching && group === activeGroup;
          const isDisabled = group === "recent" && recents.length === 0;
          return (
            <button
              key={group}
              id={tabId}
              type="button"
              className={`bland-emoji-picker-group${isActive ? " is-active" : ""}`}
              onClick={() => {
                setActiveGroup(group);
                setQuery("");
              }}
              disabled={isDisabled}
              role="tab"
              aria-selected={isActive}
              aria-label={GROUP_LABELS[group]}
              title={GROUP_LABELS[group]}
            >
              <EmojiIcon emoji={GROUP_GLYPHS[group]} size={18} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
