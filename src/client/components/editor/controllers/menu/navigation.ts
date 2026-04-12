import { useCallback, useEffect, useState } from "react";

export function getInitialMenuIndex(itemCount: number, initialIndex = 0): number {
  if (itemCount === 0) return -1;
  return Math.max(0, Math.min(initialIndex, itemCount - 1));
}

export function moveMenuIndex(currentIndex: number, itemCount: number, direction: -1 | 1): number {
  if (itemCount === 0) return -1;
  if (currentIndex < 0) return direction > 0 ? 0 : itemCount - 1;
  if (direction > 0) return currentIndex >= itemCount - 1 ? 0 : currentIndex + 1;
  return currentIndex <= 0 ? itemCount - 1 : currentIndex - 1;
}

interface UseMenuNavigationOptions<T> {
  items: T[];
  initialIndex?: number;
  listRef: React.RefObject<HTMLElement | null>;
  onSelect: (item: T) => void;
}

export function useMenuNavigation<T>({ items, initialIndex = 0, listRef, onSelect }: UseMenuNavigationOptions<T>) {
  const [selectedIndex, setSelectedIndex] = useState(() => getInitialMenuIndex(items.length, initialIndex));

  useEffect(() => {
    setSelectedIndex(getInitialMenuIndex(items.length, initialIndex));
  }, [initialIndex, items]);

  useEffect(() => {
    if (selectedIndex < 0) return;
    const item = listRef.current?.querySelector<HTMLElement>(`[data-menu-index="${selectedIndex}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [listRef, selectedIndex]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (items.length === 0) return false;

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => moveMenuIndex(index, items.length, -1));
        return true;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => moveMenuIndex(index, items.length, 1));
        return true;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const item = items[selectedIndex >= 0 ? selectedIndex : 0];
        if (item) onSelect(item);
        return true;
      }

      return false;
    },
    [items, onSelect, selectedIndex],
  );

  return {
    onKeyDown,
    selectedIndex,
    setSelectedIndex,
  };
}
