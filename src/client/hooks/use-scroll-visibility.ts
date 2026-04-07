import { useEffect, useState, useRef } from "react";

/**
 * Tracks whether a header/element should be visible based on scroll direction
 * within a given scroll container (not the window).
 */
export function useScrollVisibility(scrollElementId: string, threshold = 5): boolean {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const el = document.getElementById(scrollElementId);
    if (!el) return;

    function onScroll() {
      const currentY = el!.scrollTop;
      if (currentY < 10) {
        setVisible(true);
      } else if (currentY > lastScrollY.current + threshold) {
        setVisible(false);
      }
      lastScrollY.current = currentY;
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollElementId, threshold]);

  return visible;
}
